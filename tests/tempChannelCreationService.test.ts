import assert from 'node:assert/strict';
import test from 'node:test';

import {
  deleteTempChannelByChannelId,
  findTempChannelByChannelId,
  findTempChannelByOwner,
  insertTempChannel,
} from '../src/db/repositories/tempChannelsRepo';
import {
  createTrackedTempChannelForMember,
  type TempChannelCreationDependencies,
} from '../src/services/tempChannelCreationService';
import type { GuildSettings } from '../src/types';
import { setupTestDatabase } from './helpers/testDatabase';
import { upsertGuildSettings } from '../src/db/repositories/guildSettingsRepo';
import { DEFAULT_NAME_TEMPLATE } from '../src/config/constants';

const settings: GuildSettings = {
  guildId: 'guild-1',
  categoryId: 'category-1',
  generatorChannelId: 'generator-1',
  editableByOwner: false,
  permissionSource: 'category',
  defaultNameTemplate: DEFAULT_NAME_TEMPLATE,
  defaultUserLimit: 0,
  defaultBitrate: 0,
  language: 'ru',
  maxTempChannels: 25,
  interfaceChannelId: null,
  interfaceMessageId: null,
  createdAt: '2026-11-18T00:00:00Z',
  updatedAt: '2026-11-18T00:00:00Z',
};

function seedGuild(): void {
  upsertGuildSettings({
    guildId: settings.guildId,
    categoryId: settings.categoryId,
    generatorChannelId: settings.generatorChannelId,
    editableByOwner: settings.editableByOwner,
    permissionSource: settings.permissionSource,
    defaultNameTemplate: settings.defaultNameTemplate,
    defaultUserLimit: settings.defaultUserLimit,
    defaultBitrate: settings.defaultBitrate,
    language: settings.language,
    maxTempChannels: settings.maxTempChannels,
    interfaceChannelId: settings.interfaceChannelId,
    interfaceMessageId: settings.interfaceMessageId,
  });
}

function createHarness(options?: {
  onCreate?: () => void;
  onMove?: () => void;
  onDelete?: () => void;
}): {
  member: {
    id: string;
    guild: { id: string };
    voice: { channelId: string | null };
  };
  channel: {
    id: string;
    userLimit: number;
    delete: () => Promise<void>;
  };
  dependencies: TempChannelCreationDependencies;
  order: string[];
} {
  const order: string[] = [];
  const member = {
    id: 'owner-1',
    guild: { id: 'guild-1' },
    voice: { channelId: 'generator-1' as string | null },
  };
  const channel = {
    id: 'voice-1',
    userLimit: 0,
    delete: async () => {
      order.push('delete');
      options?.onDelete?.();
    },
  };
  const dependencies: TempChannelCreationDependencies = {
    createChannel: async () => {
      order.push('create');
      options?.onCreate?.();
      return channel as never;
    },
    moveMember: async () => {
      order.push('move');
      options?.onMove?.();
      member.voice.channelId = channel.id;
    },
    insertRecord: (input) => {
      order.push('insert');
      insertTempChannel(input);
    },
    findRecordByChannelId: findTempChannelByChannelId,
    findRecordByOwner: findTempChannelByOwner,
    cleanupArtifacts: async (_guild, channelId) => {
      order.push('cleanup');
      const record = findTempChannelByChannelId(channelId);

      if (!record) {
        return { status: 'not_tracked' };
      }

      deleteTempChannelByChannelId(channelId);

      return { status: 'completed', linkedTextResult: 'not_linked' };
    },
    delay: async () => undefined,
  };

  return { member, channel, dependencies, order };
}

test('Join-to-Create persists and confirms the room before moving the member', async () => {
  const { cleanup } = setupTestDatabase();

  try {
    seedGuild();
    const harness = createHarness();

    const result = await createTrackedTempChannelForMember(
      harness.member as never,
      settings,
      harness.dependencies,
    );

    assert.equal(result.status, 'created');
    assert.deepEqual(harness.order, ['create', 'insert', 'move']);
    assert.equal(findTempChannelByChannelId('voice-1')?.ownerUserId, 'owner-1');
  } finally {
    cleanup();
  }
});

test('Join-to-Create compensates only after the created room is database-confirmed', async () => {
  const { cleanup } = setupTestDatabase();

  try {
    seedGuild();
    const harness = createHarness({
      onCreate: () => {
        harness.member.voice.channelId = 'different-channel';
      },
      onDelete: () => {
        assert.equal(findTempChannelByChannelId('voice-1')?.guildId, 'guild-1');
      },
    });

    const result = await createTrackedTempChannelForMember(
      harness.member as never,
      settings,
      harness.dependencies,
    );

    assert.deepEqual(result, {
      status: 'compensated',
      channelId: 'voice-1',
      reason: 'member_left_before_move',
    });
    assert.deepEqual(harness.order, ['create', 'insert', 'delete', 'cleanup']);
    assert.equal(findTempChannelByChannelId('voice-1'), null);
  } finally {
    cleanup();
  }
});

test('Join-to-Create retains tracking when Discord compensation deletion fails', async () => {
  const { cleanup } = setupTestDatabase();

  try {
    seedGuild();
    const harness = createHarness({
      onMove: () => {
        throw new Error('injected move failure');
      },
      onDelete: () => {
        throw new Error('injected delete failure');
      },
    });

    const result = await createTrackedTempChannelForMember(
      harness.member as never,
      settings,
      harness.dependencies,
    );

    assert.equal(result.status, 'compensation_retry_required');
    if (result.status === 'compensation_retry_required') {
      assert.equal(result.stage, 'discord_delete');
      assert.equal(result.channelId, 'voice-1');
    }
    assert.notEqual(findTempChannelByChannelId('voice-1'), null);
    assert.deepEqual(harness.order, ['create', 'insert', 'move', 'delete']);
  } finally {
    cleanup();
  }
});

test('Join-to-Create retries transient persistence failures before moving', async () => {
  const { cleanup } = setupTestDatabase();

  try {
    seedGuild();
    const harness = createHarness();
    let attempts = 0;
    let delays = 0;
    harness.dependencies.insertRecord = (input) => {
      harness.order.push('insert');
      attempts += 1;

      if (attempts < 3) {
        throw Object.assign(new Error('database busy'), { code: 'SQLITE_BUSY' });
      }

      insertTempChannel(input);
    };
    harness.dependencies.delay = async () => {
      delays += 1;
    };

    const result = await createTrackedTempChannelForMember(
      harness.member as never,
      settings,
      harness.dependencies,
    );

    assert.equal(result.status, 'created');
    assert.equal(attempts, 3);
    assert.equal(delays, 2);
    assert.deepEqual(harness.order, ['create', 'insert', 'insert', 'insert', 'move']);
  } finally {
    cleanup();
  }
});

test('Join-to-Create confirms a committed row after a response-lost insert error', async () => {
  const { cleanup } = setupTestDatabase();

  try {
    seedGuild();
    const harness = createHarness();
    let attempts = 0;
    harness.dependencies.insertRecord = (input) => {
      harness.order.push('insert');
      attempts += 1;
      insertTempChannel(input);
      throw Object.assign(new Error('response lost after SQLite commit'), { code: 'SQLITE_IOERR' });
    };

    const result = await createTrackedTempChannelForMember(
      harness.member as never,
      settings,
      harness.dependencies,
    );

    assert.equal(result.status, 'created');
    assert.equal(attempts, 1);
    assert.deepEqual(harness.order, ['create', 'insert', 'move']);
    assert.equal(findTempChannelByChannelId('voice-1')?.ownerUserId, 'owner-1');
  } finally {
    cleanup();
  }
});

test('Join-to-Create reports an untracked orphan and never deletes it when persistence fails', async () => {
  const { cleanup } = setupTestDatabase();

  try {
    seedGuild();
    const harness = createHarness({
      onDelete: () => {
        assert.fail('An untracked Discord room must never be deleted automatically.');
      },
    });
    let attempts = 0;
    harness.dependencies.insertRecord = () => {
      harness.order.push('insert');
      attempts += 1;
      throw Object.assign(new Error('database remains busy'), { code: 'SQLITE_BUSY' });
    };

    const result = await createTrackedTempChannelForMember(
      harness.member as never,
      settings,
      harness.dependencies,
    );

    assert.equal(result.status, 'orphaned_untracked');
    assert.equal(attempts, 3);
    assert.equal(findTempChannelByChannelId('voice-1'), null);
    assert.deepEqual(harness.order, ['create', 'insert', 'insert', 'insert']);
  } finally {
    cleanup();
  }
});

test('Join-to-Create turns a uniqueness conflict into explicit reconciliation data', async () => {
  const { cleanup } = setupTestDatabase();

  try {
    seedGuild();
    insertTempChannel({
      channelId: 'voice-existing',
      guildId: 'guild-1',
      ownerUserId: 'owner-1',
      categoryId: 'category-1',
    });
    const harness = createHarness();

    const result = await createTrackedTempChannelForMember(
      harness.member as never,
      settings,
      harness.dependencies,
    );

    assert.equal(result.status, 'orphaned_untracked');
    if (result.status === 'orphaned_untracked') {
      assert.equal(result.conflictingChannelId, 'voice-existing');
    }
    assert.equal(findTempChannelByChannelId('voice-existing')?.ownerUserId, 'owner-1');
    assert.equal(findTempChannelByChannelId('voice-1'), null);
    assert.deepEqual(harness.order, ['create', 'insert']);
  } finally {
    cleanup();
  }
});
