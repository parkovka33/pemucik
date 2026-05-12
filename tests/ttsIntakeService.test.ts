import assert from 'node:assert/strict';
import test from 'node:test';

import { ChannelType, Collection } from 'discord.js';

import { DEFAULT_NAME_TEMPLATE, TEMP_TTS_MAX_MESSAGE_LENGTH } from '../src/config/constants';
import { upsertGuildSettings } from '../src/db/repositories/guildSettingsRepo';
import { upsertTempTtsSettings } from '../src/db/repositories/tempTtsSettingsRepo';
import { upsertTempTextChannel } from '../src/db/repositories/tempTextChannelsRepo';
import { insertTempChannel } from '../src/db/repositories/tempChannelsRepo';
import { resolveTempTtsMessageIntake } from '../src/services/ttsIntakeService';
import { setupTestDatabase } from './helpers/testDatabase';

function seedTrackedRoom(channelId = 'voice-1'): void {
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

function linkTrackedTextChannel(voiceChannelId = 'voice-1', textChannelId = 'text-1'): void {
  upsertTempTextChannel({
    voiceChannelId,
    textChannelId,
    guildId: 'guild-1',
  });
}

function enableTrackedRoomTts(voiceChannelId = 'voice-1', enabled = true, voiceKey = 'default'): void {
  upsertTempTtsSettings({
    voiceChannelId,
    guildId: 'guild-1',
    enabled,
    voiceKey,
  });
}

function createMessage(content: string, fetchResult: unknown, channelId = 'voice-1') {
  return {
    author: {
      id: 'member-1',
      bot: false,
    },
    channelId,
    content,
    guildId: 'guild-1',
    guild: {
      channels: {
        fetch: async (channelId: string) => {
          assert.equal(channelId, 'voice-1');
          return fetchResult as never;
        },
      },
    },
  };
}

function assertSkipped(
  result: Awaited<ReturnType<typeof resolveTempTtsMessageIntake>>,
): asserts result is Extract<Awaited<ReturnType<typeof resolveTempTtsMessageIntake>>, { status: 'skipped' }> {
  assert.equal(result.status, 'skipped');
}

test('resolveTempTtsMessageIntake accepts a normalized native voice-chat message for an enabled active room', async () => {
  const { cleanup } = setupTestDatabase();

  try {
    seedTrackedRoom();
    enableTrackedRoomTts('voice-1', true, 'ru-alt');

    const result = await resolveTempTtsMessageIntake(createMessage(
      '  hello    world  ',
      {
        id: 'voice-1',
        type: ChannelType.GuildVoice,
        members: new Collection([
          ['member-1', { id: 'member-1' }],
        ]),
      },
    ) as never);

    assert.deepEqual(result, {
      status: 'accepted',
      guildId: 'guild-1',
      textChannelId: 'voice-1',
      voiceChannelId: 'voice-1',
      authorId: 'member-1',
      voiceKey: 'ru-alt',
      content: 'hello world',
    });
  } finally {
    cleanup();
  }
});

test('resolveTempTtsMessageIntake accepts a linked temp-text message as a legacy fallback', async () => {
  const { cleanup } = setupTestDatabase();

  try {
    seedTrackedRoom();
    linkTrackedTextChannel();
    enableTrackedRoomTts();

    const result = await resolveTempTtsMessageIntake(createMessage(
      'hello world',
      {
        id: 'voice-1',
        type: ChannelType.GuildVoice,
        members: new Collection([
          ['member-1', { id: 'member-1' }],
        ]),
      },
      'text-1',
    ) as never);

    assert.deepEqual(result, {
      status: 'accepted',
      guildId: 'guild-1',
      textChannelId: 'text-1',
      voiceChannelId: 'voice-1',
      authorId: 'member-1',
      voiceKey: 'default',
      content: 'hello world',
    });
  } finally {
    cleanup();
  }
});

test('resolveTempTtsMessageIntake skips messages outside tracked native or linked TTS channels', async () => {
  const { cleanup } = setupTestDatabase();

  try {
    seedTrackedRoom();
    enableTrackedRoomTts();

    const result = await resolveTempTtsMessageIntake(createMessage(
      'hello world',
      {
        id: 'voice-1',
        type: ChannelType.GuildVoice,
        members: new Collection([
          ['member-1', { id: 'member-1' }],
        ]),
      },
      'text-1',
    ) as never);

    assert.deepEqual(result, {
      status: 'skipped',
      reason: 'not_tracked_tts_channel',
      guildId: 'guild-1',
      authorId: 'member-1',
      textChannelId: 'text-1',
    });
  } finally {
    cleanup();
  }
});

test('resolveTempTtsMessageIntake skips linked temp-text messages when room TTS is disabled', async () => {
  const { cleanup } = setupTestDatabase();

  try {
    seedTrackedRoom();
    enableTrackedRoomTts('voice-1', false, 'default');

    const result = await resolveTempTtsMessageIntake(createMessage(
      'hello world',
      {
        id: 'voice-1',
        type: ChannelType.GuildVoice,
        members: new Collection([
          ['member-1', { id: 'member-1' }],
        ]),
      },
    ) as never);

    assert.deepEqual(result, {
      status: 'skipped',
      reason: 'tts_disabled',
      guildId: 'guild-1',
      authorId: 'member-1',
      textChannelId: 'voice-1',
      voiceChannelId: 'voice-1',
    });
  } finally {
    cleanup();
  }
});

test('resolveTempTtsMessageIntake skips empty, command-like, and too-long messages before playback', async () => {
  const { cleanup } = setupTestDatabase();

  try {
    seedTrackedRoom();
    enableTrackedRoomTts();

    const voiceChannel = {
      id: 'voice-1',
      type: ChannelType.GuildVoice,
      members: new Collection([
        ['member-1', { id: 'member-1' }],
      ]),
    };

    const emptyResult = await resolveTempTtsMessageIntake(createMessage('   ', voiceChannel) as never);
    const commandLikeResult = await resolveTempTtsMessageIntake(createMessage('/voice status', voiceChannel) as never);
    const tooLongResult = await resolveTempTtsMessageIntake(createMessage(
      'a'.repeat(TEMP_TTS_MAX_MESSAGE_LENGTH + 1),
      voiceChannel,
    ) as never);

    assertSkipped(emptyResult);
    assert.equal(emptyResult.reason, 'empty_content');
    assertSkipped(commandLikeResult);
    assert.equal(commandLikeResult.reason, 'command_like');
    assertSkipped(tooLongResult);
    assert.equal(tooLongResult.reason, 'message_too_long');
    assert.equal(tooLongResult.messageLength, TEMP_TTS_MAX_MESSAGE_LENGTH + 1);
  } finally {
    cleanup();
  }
});

test('resolveTempTtsMessageIntake skips linked temp-text messages when the tracked voice room is missing, invalid, or empty', async () => {
  const { cleanup } = setupTestDatabase();

  try {
    seedTrackedRoom();
    enableTrackedRoomTts();

    const missingResult = await resolveTempTtsMessageIntake(createMessage('hello world', null) as never);
    const invalidResult = await resolveTempTtsMessageIntake(createMessage(
      'hello world',
      {
        id: 'voice-1',
        type: ChannelType.GuildText,
      },
    ) as never);
    const emptyResult = await resolveTempTtsMessageIntake(createMessage(
      'hello world',
      {
        id: 'voice-1',
        type: ChannelType.GuildVoice,
        members: new Collection(),
      },
    ) as never);

    assertSkipped(missingResult);
    assert.equal(missingResult.reason, 'voice_channel_missing');
    assertSkipped(invalidResult);
    assert.equal(invalidResult.reason, 'voice_channel_invalid');
    assertSkipped(emptyResult);
    assert.equal(emptyResult.reason, 'voice_channel_empty');
  } finally {
    cleanup();
  }
});
