import assert from 'node:assert/strict';
import test from 'node:test';

import { ChannelType, Collection } from 'discord.js';

import { DEFAULT_NAME_TEMPLATE } from '../src/config/constants';
import { upsertGuildSettings } from '../src/db/repositories/guildSettingsRepo';
import {
  findTempTextChannelByTextChannelId,
  findTempTextChannelByVoiceChannelId,
  upsertTempTextChannel,
} from '../src/db/repositories/tempTextChannelsRepo';
import { findTempChannelByChannelId, insertTempChannel } from '../src/db/repositories/tempChannelsRepo';
import {
  findTempTtsSettingsByVoiceChannelId,
  upsertTempTtsSettings,
} from '../src/db/repositories/tempTtsSettingsRepo';
import {
  cleanupDeletedTrackedTextChannel,
  recoverTrackedTempChannelsForGuild,
} from '../src/services/tempChannelRecoveryService';
import {
  destroyAllTempTtsPlayback,
  getTempTtsPlaybackStateSummary,
  seedTempTtsPlaybackStateForTests,
} from '../src/services/ttsPlaybackService';
import { setupTestDatabase } from './helpers/testDatabase';

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

test('recoverTrackedTempChannelsForGuild removes stale tracked voice and linked text state on startup', async () => {
  const { cleanup } = setupTestDatabase();

  try {
    seedTrackedRoom();
    upsertTempTextChannel({
      textChannelId: 'text-1',
      voiceChannelId: 'temp-voice',
      guildId: 'guild-1',
    });
    seedTempTtsPlaybackStateForTests({
      guildId: 'guild-1',
      queuedVoiceChannelIds: ['temp-voice'],
      connectedChannelId: 'temp-voice',
    });

    const deletedReasons: string[] = [];
    const guild = {
      id: 'guild-1',
      channels: {
        fetch: async (channelId: string) => {
          if (channelId === 'temp-voice') {
            return null;
          }

          assert.equal(channelId, 'text-1');
          return {
            id: 'text-1',
            type: ChannelType.GuildText,
            delete: async (reason: string) => {
              deletedReasons.push(reason);
            },
          };
        },
      },
    };

    const summary = await recoverTrackedTempChannelsForGuild(guild as never);

    assert.deepEqual(summary, {
      scanned: 1,
      removedStale: 1,
      retryPending: 0,
      checkedEmpty: 0,
      deletedEmpty: 0,
      syncedLinkedText: 0,
    });
    assert.deepEqual(deletedReasons, ['Pemucik: удаление связанного текстового канала для комнаты temp-voice']);
    assert.equal(findTempChannelByChannelId('temp-voice'), null);
    assert.equal(findTempTextChannelByVoiceChannelId('temp-voice'), null);
    assert.equal(getTempTtsPlaybackStateSummary('guild-1'), null);
  } finally {
    destroyAllTempTtsPlayback();
    cleanup();
  }
});

test('recoverTrackedTempChannelsForGuild deletes an existing empty tracked room on startup', async () => {
  const { cleanup } = setupTestDatabase();
  const originalSetTimeout = globalThis.setTimeout;

  globalThis.setTimeout = ((handler: Parameters<typeof setTimeout>[0]) => {
    if (typeof handler === 'function') {
      handler();
    }

    return 0 as unknown as ReturnType<typeof setTimeout>;
  }) as typeof setTimeout;

  try {
    seedTrackedRoom();
    upsertTempTextChannel({
      textChannelId: 'text-1',
      voiceChannelId: 'temp-voice',
      guildId: 'guild-1',
    });
    seedTempTtsPlaybackStateForTests({
      guildId: 'guild-1',
      queuedVoiceChannelIds: ['temp-voice'],
      connectedChannelId: 'temp-voice',
    });

    const deletedReasons: string[] = [];
    const voiceChannel = {
      id: 'temp-voice',
      type: ChannelType.GuildVoice,
      members: new Collection(),
      isVoiceBased: () => true,
      delete: async (reason: string) => {
        deletedReasons.push(reason);
      },
    };
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
          if (channelId === 'temp-voice') {
            return voiceChannel;
          }

          assert.equal(channelId, 'text-1');
          return textChannel;
        },
      },
    };

    const summary = await recoverTrackedTempChannelsForGuild(guild as never);

    assert.deepEqual(summary, {
      scanned: 1,
      removedStale: 0,
      retryPending: 0,
      checkedEmpty: 1,
      deletedEmpty: 1,
      syncedLinkedText: 0,
    });
    assert.deepEqual(deletedReasons, [
      'Pemucik: удаление пустой временной комнаты',
      'Pemucik: удаление связанного текстового канала для комнаты temp-voice',
    ]);
    assert.equal(findTempChannelByChannelId('temp-voice'), null);
    assert.equal(findTempTextChannelByVoiceChannelId('temp-voice'), null);
    assert.equal(getTempTtsPlaybackStateSummary('guild-1'), null);
  } finally {
    globalThis.setTimeout = originalSetTimeout;
    destroyAllTempTtsPlayback();
    cleanup();
  }
});

test('cleanupDeletedTrackedTextChannel removes only tracked linked text metadata', () => {
  const { cleanup } = setupTestDatabase();

  try {
    seedTrackedRoom();
    upsertTempTextChannel({
      textChannelId: 'text-1',
      voiceChannelId: 'temp-voice',
      guildId: 'guild-1',
    });

    assert.equal(cleanupDeletedTrackedTextChannel('text-1'), true);
    assert.equal(findTempTextChannelByTextChannelId('text-1'), null);
    assert.equal(cleanupDeletedTrackedTextChannel('text-missing'), false);
  } finally {
    cleanup();
  }
});

test('startup recovery preserves its database anchor when linked text deletion needs a retry', async () => {
  const { cleanup } = setupTestDatabase();

  try {
    seedTrackedRoom();
    upsertTempTextChannel({
      textChannelId: 'text-1',
      voiceChannelId: 'temp-voice',
      guildId: 'guild-1',
    });
    upsertTempTtsSettings({
      voiceChannelId: 'temp-voice',
      guildId: 'guild-1',
      enabled: true,
      voiceKey: 'ru-alt',
    });
    seedTempTtsPlaybackStateForTests({
      guildId: 'guild-1',
      queuedVoiceChannelIds: ['temp-voice'],
      connectedChannelId: 'temp-voice',
    });

    let textDeleteAttempts = 0;
    const deletedChannelIds: string[] = [];
    const guild = {
      id: 'guild-1',
      channels: {
        fetch: async (channelId: string) => {
          if (channelId === 'temp-voice') {
            return null;
          }

          assert.equal(channelId, 'text-1');
          return {
            id: 'text-1',
            type: ChannelType.GuildText,
            delete: async () => {
              textDeleteAttempts += 1;

              if (textDeleteAttempts === 1) {
                throw new Error('injected Discord permission failure');
              }

              deletedChannelIds.push('text-1');
            },
          };
        },
      },
    };

    const firstSummary = await recoverTrackedTempChannelsForGuild(guild as never);

    assert.deepEqual(firstSummary, {
      scanned: 1,
      removedStale: 0,
      retryPending: 1,
      checkedEmpty: 0,
      deletedEmpty: 0,
      syncedLinkedText: 0,
    });
    assert.notEqual(findTempChannelByChannelId('temp-voice'), null);
    assert.notEqual(findTempTextChannelByVoiceChannelId('temp-voice'), null);
    assert.equal(findTempTtsSettingsByVoiceChannelId('temp-voice')?.voiceKey, 'ru-alt');
    assert.equal(getTempTtsPlaybackStateSummary('guild-1'), null);
    assert.deepEqual(deletedChannelIds, []);

    const secondSummary = await recoverTrackedTempChannelsForGuild(guild as never);

    assert.deepEqual(secondSummary, {
      scanned: 1,
      removedStale: 1,
      retryPending: 0,
      checkedEmpty: 0,
      deletedEmpty: 0,
      syncedLinkedText: 0,
    });
    assert.equal(findTempChannelByChannelId('temp-voice'), null);
    assert.equal(findTempTextChannelByVoiceChannelId('temp-voice'), null);
    assert.equal(findTempTtsSettingsByVoiceChannelId('temp-voice'), null);
    assert.deepEqual(deletedChannelIds, ['text-1']);
  } finally {
    destroyAllTempTtsPlayback();
    cleanup();
  }
});
