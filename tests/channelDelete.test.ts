import assert from 'node:assert/strict';
import test from 'node:test';

import { ChannelType } from 'discord.js';

import { DEFAULT_NAME_TEMPLATE } from '../src/config/constants';
import { upsertGuildSettings } from '../src/db/repositories/guildSettingsRepo';
import { findTempTextChannelByVoiceChannelId, upsertTempTextChannel } from '../src/db/repositories/tempTextChannelsRepo';
import { findTempChannelByChannelId, insertTempChannel } from '../src/db/repositories/tempChannelsRepo';
import { registerChannelDeleteHandler } from '../src/events/channelDelete';
import { destroyAllTempTtsPlayback, getTempTtsPlaybackStateSummary, seedTempTtsPlaybackStateForTests } from '../src/services/ttsPlaybackService';
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

test('registerChannelDeleteHandler cleans tracked voice artifacts on external voice-channel deletion', async () => {
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
    let channelDeleteHandler: ((channel: unknown) => Promise<void>) | null = null;
    const infoPayloads: Array<Record<string, unknown>> = [];
    const errorPayloads: Array<Record<string, unknown>> = [];
    const client = {
      on: (event: string, handler: (channel: unknown) => Promise<void>) => {
        assert.equal(event, 'channelDelete');
        channelDeleteHandler = handler;
      },
    };
    const logger = {
      info: (payload: Record<string, unknown>) => {
        infoPayloads.push(payload);
      },
      error: (payload: Record<string, unknown>) => {
        errorPayloads.push(payload);
      },
    };

    registerChannelDeleteHandler(client as never, logger as never);
    if (channelDeleteHandler === null) {
      assert.fail('channelDelete handler was not registered');
    }
    const registeredChannelDeleteHandler: (channel: unknown) => Promise<void> = channelDeleteHandler;

    const deletedReasons: string[] = [];
    const voiceChannel = {
      id: 'temp-voice',
      type: ChannelType.GuildVoice,
      guild: {
        id: 'guild-1',
        channels: {
          fetch: async (channelId: string) => {
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
      },
    };

    await registeredChannelDeleteHandler(voiceChannel as never);

    assert.equal(findTempChannelByChannelId('temp-voice'), null);
    assert.equal(findTempTextChannelByVoiceChannelId('temp-voice'), null);
    assert.equal(getTempTtsPlaybackStateSummary('guild-1'), null);
    assert.deepEqual(deletedReasons, ['Noi: удаление связанного текстового канала для комнаты temp-voice']);
    assert.deepEqual(infoPayloads, [{
      event: 'tracked_temp_voice_channel_deleted_recovered',
      guildId: 'guild-1',
      channelId: 'temp-voice',
    }]);
    assert.deepEqual(errorPayloads, []);
  } finally {
    destroyAllTempTtsPlayback();
    cleanup();
  }
});

test('registerChannelDeleteHandler removes only tracked text metadata on external text-channel deletion', async () => {
  const { cleanup } = setupTestDatabase();

  try {
    seedTrackedRoom();
    upsertTempTextChannel({
      textChannelId: 'text-1',
      voiceChannelId: 'temp-voice',
      guildId: 'guild-1',
    });

    let channelDeleteHandler: ((channel: unknown) => Promise<void>) | null = null;
    const infoPayloads: Array<Record<string, unknown>> = [];
    const errorPayloads: Array<Record<string, unknown>> = [];
    const client = {
      on: (event: string, handler: (channel: unknown) => Promise<void>) => {
        assert.equal(event, 'channelDelete');
        channelDeleteHandler = handler;
      },
    };
    const logger = {
      info: (payload: Record<string, unknown>) => {
        infoPayloads.push(payload);
      },
      error: (payload: Record<string, unknown>) => {
        errorPayloads.push(payload);
      },
    };

    registerChannelDeleteHandler(client as never, logger as never);
    if (channelDeleteHandler === null) {
      assert.fail('channelDelete handler was not registered');
    }
    const registeredChannelDeleteHandler: (channel: unknown) => Promise<void> = channelDeleteHandler;

    const textChannel = {
      id: 'text-1',
      type: ChannelType.GuildText,
      guild: {
        id: 'guild-1',
      },
    };

    await registeredChannelDeleteHandler(textChannel as never);

    assert.notEqual(findTempChannelByChannelId('temp-voice'), null);
    assert.equal(findTempTextChannelByVoiceChannelId('temp-voice'), null);
    assert.deepEqual(infoPayloads, [{
      event: 'tracked_temp_text_channel_deleted_recovered',
      guildId: 'guild-1',
      channelId: 'text-1',
    }]);
    assert.deepEqual(errorPayloads, []);
  } finally {
    cleanup();
  }
});
