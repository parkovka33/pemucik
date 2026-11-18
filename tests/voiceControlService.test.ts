import assert from 'node:assert/strict';
import test from 'node:test';

import {
  ChannelType,
  Collection,
  PermissionFlagsBits,
  PermissionsBitField,
} from 'discord.js';

import { DEFAULT_NAME_TEMPLATE } from '../src/config/constants';
import { upsertGuildSettings } from '../src/db/repositories/guildSettingsRepo';
import {
  findTempTextChannelByVoiceChannelId,
  upsertTempTextChannel,
} from '../src/db/repositories/tempTextChannelsRepo';
import {
  findTempChannelByChannelId,
  insertTempChannel,
} from '../src/db/repositories/tempChannelsRepo';
import {
  buildRenameModal,
  claimPanelChannel,
  lockPanelChannel,
  PanelServiceError,
  unlockPanelChannel,
} from '../src/services/panelService';
import { ManagedPermissionMutationError } from '../src/services/managedPermissionMutation';
import {
  deleteVoiceChannel,
  VoiceControlServiceError,
  ghostVoiceChannel,
  rejectVoiceAccess,
  resolveVoiceBitrateBits,
  setVoiceChannelStatus,
  unghostVoiceChannel,
} from '../src/services/voiceControlService';
import {
  createOverwrite,
  createPermissionOverwriteManager,
  createRole,
  type PermissionEditFailure,
} from './helpers/discordFakes';
import { setupTestDatabase } from './helpers/testDatabase';

const SET_VOICE_CHANNEL_STATUS_PERMISSION = 1n << 48n;

test('buildRenameModal allows an uncached room name without an empty preset value', () => {
  const modal = buildRenameModal('voice-1', '').toJSON();
  const actionRow = modal.components[0];

  assert.ok(actionRow && 'components' in actionRow);
  const textInput = actionRow.components[0];

  assert.equal(textInput?.custom_id, 'name');
  assert.equal('value' in (textInput ?? {}), false);
});

function createGuildContext() {
  const everyoneRoleId = 'everyone';
  const adminRole = createRole(
    'admin-role',
    [PermissionFlagsBits.Administrator],
    'admin',
  );
  const regularRole = createRole('regular-role', [], 'regular');
  const manageRole = createRole(
    'manage-role',
    [PermissionFlagsBits.ManageChannels],
    'manager',
  );
  const everyoneRole = createRole(everyoneRoleId, [], '@everyone');
  const roles = new Collection<
    string,
    typeof adminRole | typeof regularRole | typeof everyoneRole | typeof manageRole
  >([
    [everyoneRole.id, everyoneRole],
    [adminRole.id, adminRole],
    [manageRole.id, manageRole],
    [regularRole.id, regularRole],
  ]);

  return {
    everyoneRoleId,
    guild: {
      id: 'guild-1',
      roles: {
        everyone: { id: everyoneRoleId },
        cache: roles,
      },
      members: {
        me: { id: 'bot-user' },
        fetch: async (memberId: string) => ({ id: memberId }),
      },
      channels: {
        fetch: async (channelId: string) => {
          void channelId;
          return null;
        },
      },
    },
  };
}

function seedTrackedRoom(channelId = 'temp-voice'): void {
  upsertGuildSettings({
    guildId: 'guild-1',
    categoryId: 'category-1',
    generatorChannelId: 'generator-1',
    editableByOwner: true,
    permissionSource: 'category',
    defaultNameTemplate: DEFAULT_NAME_TEMPLATE,
    defaultUserLimit: 0,
    defaultBitrate: 0,
    language: 'ru',
    maxTempChannels: 25,
    interfaceChannelId: null,
    interfaceMessageId: null,
  });

  insertTempChannel({
    channelId,
    guildId: 'guild-1',
    ownerUserId: 'owner-user',
    categoryId: 'category-1',
    isLocked: false,
    userLimit: 0,
  });
}

function createManagedTarget(failures: PermissionEditFailure[] = []) {
  const { guild, everyoneRoleId } = createGuildContext();
  const overwrites = createPermissionOverwriteManager([
    createOverwrite(everyoneRoleId),
    createOverwrite('admin-role'),
  ], failures);

  const channel = {
    id: 'temp-voice',
    type: ChannelType.GuildVoice,
    guild,
    permissionOverwrites: overwrites,
    permissionsFor: (subject: { id: string; permissions?: PermissionsBitField }) => {
      if (subject.permissions?.has(PermissionFlagsBits.Administrator)) {
        return new PermissionsBitField([
          PermissionFlagsBits.Connect,
          PermissionFlagsBits.ViewChannel,
        ]);
      }

      const permissions = new PermissionsBitField([
        PermissionFlagsBits.Connect,
        PermissionFlagsBits.ViewChannel,
      ]);
      const everyoneOverwrite = overwrites.cache.get(everyoneRoleId);
      const subjectOverwrite = overwrites.cache.get(subject.id);

      if (everyoneOverwrite) {
        permissions.remove(everyoneOverwrite.deny);
        permissions.add(everyoneOverwrite.allow);
      }

      if (subjectOverwrite) {
        permissions.remove(subjectOverwrite.deny);
        permissions.add(subjectOverwrite.allow);
      }

      return permissions;
    },
  };

  guild.channels.fetch = async (channelId: string) => {
    assert.equal(channelId, channel.id);
    return channel as never;
  };

  return {
    overwrites,
    channel,
    target: {
      record: {
        channelId: 'temp-voice',
        guildId: 'guild-1',
        ownerUserId: 'owner-user',
        categoryId: 'category-1',
        createdAt: '2026-05-06T00:00:00Z',
        lastActiveAt: '2026-05-06T00:00:00Z',
        isLocked: false,
        userLimit: 0,
      },
      channel,
      actorCanManage: true,
      actorCanClaimOwnership: false,
      accessMode: 'owner',
    },
  };
}

function createActor(channel: { id: string; guild: { id: string } }) {
  return {
    id: 'owner-user',
    guild: {
      id: channel.guild.id,
      channels: {
        fetch: async (channelId: string) => {
          assert.equal(channelId, channel.id);
          return channel;
        },
      },
    },
    user: { tag: 'owner#0001' },
    voice: { channelId: channel.id },
    client: {
      rest: {
        put: async () => undefined,
      },
    },
  };
}

test('resolveVoiceBitrateBits validates integer bounds and guild maximum', () => {
  const guild = { maximumBitrate: 96_000 };

  assert.equal(resolveVoiceBitrateBits(guild as never, 64), 64_000);

  assert.throws(
    () => resolveVoiceBitrateBits(guild as never, 7),
    (error: unknown) =>
      error instanceof VoiceControlServiceError &&
      error.code === 'INVALID_BITRATE',
  );

  assert.throws(
    () => resolveVoiceBitrateBits(guild as never, 97),
    (error: unknown) =>
      error instanceof VoiceControlServiceError &&
      error.code === 'INVALID_BITRATE',
  );

  assert.throws(
    () => resolveVoiceBitrateBits(guild as never, 64.5),
    (error: unknown) =>
      error instanceof VoiceControlServiceError &&
      error.code === 'INVALID_BITRATE',
  );
});

test('lockPanelChannel preserves owner, bot, and admin access while marking the room locked in SQLite', async () => {
  const { cleanup } = setupTestDatabase();

  try {
    seedTrackedRoom();
    const { target, overwrites } = createManagedTarget();

    const result = await lockPanelChannel(target as never);

    assert.equal(result.record.isLocked, true);
    assert.deepEqual(overwrites.editCalls, [
      { id: 'owner-user', patch: { Connect: true } },
      { id: 'bot-user', patch: { Connect: true } },
      { id: 'manage-role', patch: { Connect: true } },
      { id: 'everyone', patch: { Connect: false } },
    ]);
    assert.equal(findTempChannelByChannelId('temp-voice')?.isLocked, true);
  } finally {
    cleanup();
  }
});

test('lockPanelChannel rolls back failures before and after every Discord overwrite mutation', async (testContext) => {
  for (const timing of ['before', 'after'] as const) {
    for (let call = 1; call <= 4; call += 1) {
      await testContext.test(`${timing} mutation ${call}`, async () => {
        const { cleanup } = setupTestDatabase();

        try {
          seedTrackedRoom();
          const { target, channel } = createManagedTarget([{ call, timing }]);
          channel.permissionOverwrites.cache.set(
            'regular-role',
            createOverwrite('regular-role', { allow: [PermissionFlagsBits.ViewChannel] }),
          );

          await assert.rejects(
            lockPanelChannel(target as never),
            (error: unknown) => error instanceof ManagedPermissionMutationError,
          );

          for (const overwriteId of ['owner-user', 'bot-user', 'manage-role', 'everyone']) {
            const overwrite = channel.permissionOverwrites.cache.get(overwriteId);
            assert.equal(overwrite?.allow.has(PermissionFlagsBits.Connect) ?? false, false);
            assert.equal(overwrite?.deny.has(PermissionFlagsBits.Connect) ?? false, false);
          }
          assert.equal(
            channel.permissionOverwrites.cache
              .get('regular-role')
              ?.allow.has(PermissionFlagsBits.ViewChannel),
            true,
          );
          assert.equal(findTempChannelByChannelId('temp-voice')?.isLocked, false);
        } finally {
          cleanup();
        }
      });
    }
  }
});

test('lockPanelChannel records observed Discord state when rollback itself fails', async () => {
  const { cleanup } = setupTestDatabase();

  try {
    seedTrackedRoom();
    const { target, channel } = createManagedTarget([
      { call: 4, timing: 'after', error: new Error('response lost after broad deny') },
      { call: 5, timing: 'before', error: new Error('rollback deny clear failed') },
    ]);

    await assert.rejects(
      lockPanelChannel(target as never),
      (error: unknown) =>
        error instanceof ManagedPermissionMutationError
        && error.code === 'ROLLBACK_FAILED'
        && error.message.includes('everyone'),
    );

    assert.equal(
      channel.permissionOverwrites.cache
        .get('everyone')
        ?.deny.has(PermissionFlagsBits.Connect),
      true,
    );
    assert.equal(findTempChannelByChannelId('temp-voice')?.isLocked, true);
  } finally {
    cleanup();
  }
});

test('lockPanelChannel refuses an explicit owner deny before changing any overwrite', async () => {
  const { cleanup } = setupTestDatabase();

  try {
    seedTrackedRoom();
    const { target, channel, overwrites } = createManagedTarget();
    channel.permissionOverwrites.cache.set(
      'owner-user',
      createOverwrite('owner-user', { deny: [PermissionFlagsBits.Connect] }),
    );

    await assert.rejects(
      lockPanelChannel(target as never),
      (error: unknown) =>
        error instanceof PanelServiceError
        && error.code === 'PERMISSION_SAFETY_BLOCKED',
    );
    assert.deepEqual(overwrites.editCalls, []);
    assert.equal(findTempChannelByChannelId('temp-voice')?.isLocked, false);
  } finally {
    cleanup();
  }
});

test('repeated lock and ghost requests are idempotent and preserve established safety overwrites', async () => {
  const { cleanup } = setupTestDatabase();

  try {
    seedTrackedRoom();
    const { target, channel, overwrites } = createManagedTarget();
    const actor = createActor(channel);

    const locked = await lockPanelChannel(target as never);
    const firstLockCallCount = overwrites.editCalls.length;
    await lockPanelChannel(locked as never);
    assert.equal(overwrites.editCalls.length, firstLockCallCount);

    await ghostVoiceChannel(target as never, actor as never);
    const firstGhostCallCount = overwrites.editCalls.length;
    await ghostVoiceChannel(target as never, actor as never);
    assert.equal(overwrites.editCalls.length, firstGhostCallCount);
  } finally {
    cleanup();
  }
});

test('unlockPanelChannel clears only the managed everyone Connect deny and unlocks the SQLite row', async () => {
  const { cleanup } = setupTestDatabase();

  try {
    seedTrackedRoom();
    const { target, channel } = createManagedTarget();

    channel.permissionOverwrites.cache.set(
      'everyone',
      createOverwrite('everyone', {
        allow: [PermissionFlagsBits.ViewChannel],
        deny: [PermissionFlagsBits.Connect],
      }),
    );

    await lockPanelChannel(target as never);

    const result = await unlockPanelChannel({
      ...target,
      record: {
        ...target.record,
        isLocked: true,
      },
    } as never);

    assert.equal(result.record.isLocked, false);
    assert.equal(
      channel.permissionOverwrites.cache
        .get('everyone')
        ?.allow.has(PermissionFlagsBits.ViewChannel),
      true,
    );
    assert.equal(
      channel.permissionOverwrites.cache
        .get('everyone')
        ?.deny.has(PermissionFlagsBits.Connect),
      false,
    );
    assert.equal(findTempChannelByChannelId('temp-voice')?.isLocked, false);
  } finally {
    cleanup();
  }
});

test('ghostVoiceChannel and unghostVoiceChannel only touch visibility permissions needed for Pemucik', async () => {
  const { cleanup } = setupTestDatabase();

  try {
    seedTrackedRoom();
    const { target, overwrites, channel } = createManagedTarget();
    const actor = createActor(channel);

    await ghostVoiceChannel(target as never, actor as never);

    assert.deepEqual(overwrites.editCalls, [
      { id: 'owner-user', patch: { ViewChannel: true } },
      { id: 'bot-user', patch: { ViewChannel: true } },
      { id: 'manage-role', patch: { ViewChannel: true } },
      { id: 'everyone', patch: { ViewChannel: false } },
    ]);

    overwrites.editCalls.length = 0;

    await unghostVoiceChannel(target as never, actor as never);

    assert.deepEqual(overwrites.editCalls, [
      { id: 'everyone', patch: { ViewChannel: null } },
    ]);
  } finally {
    cleanup();
  }
});

test('ghostVoiceChannel rolls back a response-lost failure after the broad deny', async () => {
  const { cleanup } = setupTestDatabase();

  try {
    seedTrackedRoom();
    const { target, overwrites, channel } = createManagedTarget([
      { call: 4, timing: 'after', error: new Error('ghost response lost') },
    ]);
    const actor = createActor(channel);

    await assert.rejects(
      ghostVoiceChannel(target as never, actor as never),
      (error: unknown) => error instanceof ManagedPermissionMutationError,
    );

    for (const overwriteId of ['owner-user', 'bot-user', 'manage-role', 'everyone']) {
      const overwrite = channel.permissionOverwrites.cache.get(overwriteId);
      assert.equal(overwrite?.allow.has(PermissionFlagsBits.ViewChannel) ?? false, false);
      assert.equal(overwrite?.deny.has(PermissionFlagsBits.ViewChannel) ?? false, false);
    }
    assert.equal(overwrites.editCalls.length, 8);
  } finally {
    cleanup();
  }
});

test('setVoiceChannelStatus sends the raw REST update when bot permissions are sufficient', async () => {
  const restCalls: Array<{ path: string; body: unknown; reason?: string }> = [];
  const botMember = {
    id: 'bot-user',
    voice: { channelId: 'temp-voice' },
  };

  const channel = {
    id: 'temp-voice',
    guild: {
      members: {
        me: botMember,
      },
    },
    permissionsFor: () =>
      new PermissionsBitField([SET_VOICE_CHANNEL_STATUS_PERMISSION]),
  };

  const actor = {
    ...createActor({ id: 'temp-voice', guild: { id: 'guild-1' } }),
    client: {
      rest: {
        put: async (
          path: string,
          options: { body: unknown; reason?: string },
        ) => {
          const call: { path: string; body: unknown; reason?: string } = {
            path,
            body: options.body,
          };

          if (options.reason !== undefined) {
            call.reason = options.reason;
          }

          restCalls.push(call);
          return undefined;
        },
      },
    },
  };

  const status = await setVoiceChannelStatus(
    {
      record: {
        channelId: 'temp-voice',
        guildId: 'guild-1',
        ownerUserId: 'owner-user',
        categoryId: 'category-1',
        createdAt: '2026-05-06T00:00:00Z',
        lastActiveAt: '2026-05-06T00:00:00Z',
        isLocked: false,
        userLimit: 0,
      },
      channel,
      actorCanManage: true,
    } as never,
    actor as never,
    'Ready to raid',
  );

  assert.equal(status, 'Ready to raid');
  assert.deepEqual(restCalls, [
    {
      path: '/channels/temp-voice/voice-status',
      body: { status: 'Ready to raid' },
      reason: 'Pemucik: изменение статуса комнаты пользователем owner#0001',
    },
  ]);
});

test('setVoiceChannelStatus fails fast when bot lacks the custom voice-status permission', async () => {
  const channel = {
    id: 'temp-voice',
    guild: {
      members: {
        me: {
          id: 'bot-user',
          voice: { channelId: 'temp-voice' },
        },
      },
    },
    permissionsFor: () => new PermissionsBitField([]),
  };

  await assert.rejects(
    () =>
      setVoiceChannelStatus(
        {
          record: {
            channelId: 'temp-voice',
            guildId: 'guild-1',
            ownerUserId: 'owner-user',
            categoryId: 'category-1',
            createdAt: '2026-05-06T00:00:00Z',
            lastActiveAt: '2026-05-06T00:00:00Z',
            isLocked: false,
            userLimit: 0,
          },
          channel,
          actorCanManage: true,
        } as never,
        createActor({ id: 'temp-voice', guild: { id: 'guild-1' } }) as never,
        'Hidden status',
      ),
    (error: unknown) =>
      error instanceof VoiceControlServiceError &&
      error.code === 'VOICE_STATUS_PERMISSION_REQUIRED',
  );
});

test('rejectVoiceAccess blocks dangerous role targets before mutating channel permissions', async () => {
  const { target } = createManagedTarget();

  await assert.rejects(
    () =>
      rejectVoiceAccess(
        target as never,
        createActor(target.channel) as never,
        {
          id: 'everyone',
          permissions: new PermissionsBitField([]),
        } as never,
      ),
    (error: unknown) =>
      error instanceof VoiceControlServiceError &&
      error.code === 'REJECT_EVERYONE_NOT_ALLOWED',
  );

  await assert.rejects(
    () =>
      rejectVoiceAccess(
        target as never,
        createActor(target.channel) as never,
        {
          id: 'admin-role',
          permissions: new PermissionsBitField([
            PermissionFlagsBits.Administrator,
          ]),
        } as never,
      ),
    (error: unknown) =>
      error instanceof VoiceControlServiceError &&
      error.code === 'REJECT_ADMIN_ROLE_NOT_ALLOWED',
  );
});

test('claimPanelChannel grants managed visibility to the claimant in a ghosted room', async () => {
  const { cleanup } = setupTestDatabase();

  try {
    seedTrackedRoom();

    const { guild, everyoneRoleId } = createGuildContext();
    const claimantPermissions = new PermissionsBitField([]);
    const overwrites = createPermissionOverwriteManager([
      createOverwrite(everyoneRoleId, {
        deny: [PermissionFlagsBits.ViewChannel],
      }),
    ]);
    const claimant = {
      id: 'claimant-user',
      permissions: claimantPermissions,
      guild: {
        id: 'guild-1',
        channels: {
          fetch: async (channelId: string) => {
            assert.equal(channelId, 'temp-voice');
            return channel;
          },
        },
      },
      voice: { channelId: 'temp-voice' },
      user: { tag: 'claimant#0001' },
    };
    const channel = {
      id: 'temp-voice',
      type: ChannelType.GuildVoice,
      guild,
      permissionOverwrites: overwrites,
      members: new Collection([[claimant.id, claimant]]),
    };
    const target = {
      record: {
        channelId: 'temp-voice',
        guildId: 'guild-1',
        ownerUserId: 'owner-user',
        categoryId: 'category-1',
        createdAt: '2026-05-06T00:00:00Z',
        lastActiveAt: '2026-05-06T00:00:00Z',
        isLocked: false,
        userLimit: 0,
      },
      channel,
      actorCanManage: false,
      actorCanClaimOwnership: true,
      accessMode: 'claim',
    };

    const result = await claimPanelChannel(target as never, claimant as never);

    assert.equal(result.record.ownerUserId, 'claimant-user');
    assert.equal(
      findTempChannelByChannelId('temp-voice')?.ownerUserId,
      'claimant-user',
    );
    assert.deepEqual(overwrites.editCalls, [
      { id: 'claimant-user', patch: { ViewChannel: true } },
    ]);
  } finally {
    cleanup();
  }
});

test('deleteVoiceChannel removes linked temp text artifacts after manual room deletion', async () => {
  const { cleanup } = setupTestDatabase();

  try {
    seedTrackedRoom();
    upsertTempTextChannel({
      textChannelId: 'text-1',
      voiceChannelId: 'temp-voice',
      guildId: 'guild-1',
    });

    const deletedReasons: string[] = [];
    const textChannel = {
      id: 'text-1',
      type: ChannelType.GuildText,
      delete: async (reason: string) => {
        deletedReasons.push(reason);
      },
    };
    const guild = {
      id: 'guild-1',
      channels: {
        fetch: async (channelId: string) => {
          assert.equal(channelId, 'text-1');
          return textChannel;
        },
      },
    };
    const voiceDeleteReasons: string[] = [];
    const voiceChannel = {
      id: 'temp-voice',
      guild,
      delete: async (reason: string) => {
        voiceDeleteReasons.push(reason);
      },
    };

    await deleteVoiceChannel(
      {
        record: {
          channelId: 'temp-voice',
          guildId: 'guild-1',
          ownerUserId: 'owner-user',
          categoryId: 'category-1',
          createdAt: '2026-05-06T00:00:00Z',
          lastActiveAt: '2026-05-06T00:00:00Z',
          isLocked: false,
          userLimit: 0,
        },
        channel: voiceChannel,
        actorCanManage: true,
      } as never,
      {
        guild,
        user: { tag: 'owner#0001' },
      } as never,
    );

    assert.deepEqual(voiceDeleteReasons, [
      'Pemucik: удаление комнаты пользователем owner#0001',
    ]);
    assert.deepEqual(deletedReasons, [
      'Pemucik: удаление связанного текстового канала для комнаты temp-voice',
    ]);
    assert.equal(findTempChannelByChannelId('temp-voice'), null);
    assert.equal(findTempTextChannelByVoiceChannelId('temp-voice'), null);
  } finally {
    cleanup();
  }
});
