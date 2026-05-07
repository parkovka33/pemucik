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
import { findTempChannelByChannelId, insertTempChannel } from '../src/db/repositories/tempChannelsRepo';
import { lockPanelChannel, unlockPanelChannel } from '../src/services/panelService';
import {
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
} from './helpers/discordFakes';
import { setupTestDatabase } from './helpers/testDatabase';

const SET_VOICE_CHANNEL_STATUS_PERMISSION = 1n << 48n;

function createGuildContext() {
  const everyoneRoleId = 'everyone';
  const adminRole = createRole('admin-role', [PermissionFlagsBits.Administrator], 'admin');
  const regularRole = createRole('regular-role', [], 'regular');
  const everyoneRole = createRole(everyoneRoleId, [], '@everyone');
  const roles = new Collection<string, typeof adminRole | typeof regularRole | typeof everyoneRole>([
    [everyoneRole.id, everyoneRole],
    [adminRole.id, adminRole],
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

function createManagedTarget() {
  const { guild, everyoneRoleId } = createGuildContext();
  const overwrites = createPermissionOverwriteManager([
    createOverwrite(everyoneRoleId),
    createOverwrite('admin-role'),
  ]);

  const channel = {
    id: 'temp-voice',
    type: ChannelType.GuildVoice,
    guild,
    permissionOverwrites: overwrites,
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
      error instanceof VoiceControlServiceError
      && error.code === 'INVALID_BITRATE',
  );

  assert.throws(
    () => resolveVoiceBitrateBits(guild as never, 97),
    (error: unknown) =>
      error instanceof VoiceControlServiceError
      && error.code === 'INVALID_BITRATE',
  );

  assert.throws(
    () => resolveVoiceBitrateBits(guild as never, 64.5),
    (error: unknown) =>
      error instanceof VoiceControlServiceError
      && error.code === 'INVALID_BITRATE',
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
      { id: 'everyone', patch: { Connect: false } },
      { id: 'owner-user', patch: { Connect: true } },
      { id: 'bot-user', patch: { Connect: true } },
      { id: 'admin-role', patch: { Connect: true } },
    ]);
    assert.equal(findTempChannelByChannelId('temp-voice')?.isLocked, true);
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
    assert.equal(channel.permissionOverwrites.cache.get('everyone')?.allow.has(PermissionFlagsBits.ViewChannel), true);
    assert.equal(channel.permissionOverwrites.cache.get('everyone')?.deny.has(PermissionFlagsBits.Connect), false);
    assert.equal(findTempChannelByChannelId('temp-voice')?.isLocked, false);
  } finally {
    cleanup();
  }
});

test('ghostVoiceChannel and unghostVoiceChannel only touch visibility permissions needed for XenoVoice', async () => {
  const { cleanup } = setupTestDatabase();

  try {
    seedTrackedRoom();
    const { target, overwrites, channel } = createManagedTarget();
    const actor = createActor(channel);

    await ghostVoiceChannel(target as never, actor as never);

    assert.deepEqual(overwrites.editCalls, [
      { id: 'everyone', patch: { ViewChannel: false } },
      { id: 'owner-user', patch: { ViewChannel: true } },
      { id: 'bot-user', patch: { ViewChannel: true } },
      { id: 'admin-role', patch: { ViewChannel: true } },
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
    permissionsFor: () => new PermissionsBitField([SET_VOICE_CHANNEL_STATUS_PERMISSION]),
  };

  const actor = {
    ...createActor({ id: 'temp-voice', guild: { id: 'guild-1' } }),
    client: {
      rest: {
        put: async (path: string, options: { body: unknown; reason?: string }) => {
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

  const status = await setVoiceChannelStatus({
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
  } as never, actor as never, 'Ready to raid');

  assert.equal(status, 'Ready to raid');
  assert.deepEqual(restCalls, [
    {
      path: '/channels/temp-voice/voice-status',
      body: { status: 'Ready to raid' },
      reason: 'XenoVoice: изменение статуса комнаты пользователем owner#0001',
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
    () => setVoiceChannelStatus({
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
    } as never, createActor({ id: 'temp-voice', guild: { id: 'guild-1' } }) as never, 'Hidden status'),
    (error: unknown) =>
      error instanceof VoiceControlServiceError
      && error.code === 'VOICE_STATUS_PERMISSION_REQUIRED',
  );
});

test('rejectVoiceAccess blocks dangerous role targets before mutating channel permissions', async () => {
  const { target } = createManagedTarget();

  await assert.rejects(
    () => rejectVoiceAccess(target as never, createActor(target.channel) as never, {
      id: 'everyone',
      permissions: new PermissionsBitField([]),
    } as never),
    (error: unknown) =>
      error instanceof VoiceControlServiceError
      && error.code === 'REJECT_EVERYONE_NOT_ALLOWED',
  );

  await assert.rejects(
    () => rejectVoiceAccess(target as never, createActor(target.channel) as never, {
      id: 'admin-role',
      permissions: new PermissionsBitField([PermissionFlagsBits.Administrator]),
    } as never),
    (error: unknown) =>
      error instanceof VoiceControlServiceError
      && error.code === 'REJECT_ADMIN_ROLE_NOT_ALLOWED',
  );
});
