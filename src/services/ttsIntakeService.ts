import { ChannelType, type Message, type VoiceChannel } from 'discord.js';

import {
  TEMP_TTS_MAX_MESSAGE_LENGTH,
  TEMP_TTS_USER_COOLDOWN_MS,
} from '../config/constants';
import { findTempTtsSettingsByVoiceChannelId } from '../db/repositories/tempTtsSettingsRepo';
import { findTempTextChannelByTextChannelId } from '../db/repositories/tempTextChannelsRepo';
import { findTempChannelByChannelId } from '../db/repositories/tempChannelsRepo';

export type TempTtsMessageSkipReason =
  | 'not_guild_message'
  | 'bot_author'
  | 'not_tracked_tts_channel'
  | 'voice_room_not_tracked'
  | 'tts_disabled'
  | 'empty_content'
  | 'command_like'
  | 'message_too_long'
  | 'voice_channel_missing'
  | 'voice_channel_invalid'
  | 'voice_channel_empty'
  | 'author_not_in_voice_channel'
  | 'rate_limited';

export interface AcceptedTempTtsMessage {
  status: 'accepted';
  guildId: string;
  textChannelId: string;
  voiceChannelId: string;
  authorId: string;
  voiceKey: string;
  content: string;
}

export interface SkippedTempTtsMessage {
  status: 'skipped';
  reason: TempTtsMessageSkipReason;
  guildId?: string;
  textChannelId?: string;
  voiceChannelId?: string;
  authorId?: string;
  messageLength?: number;
}

export type TempTtsMessageIntakeResult =
  AcceptedTempTtsMessage | SkippedTempTtsMessage;

type TempTtsIntakeMessage = Pick<
  Message,
  'author' | 'channelId' | 'content' | 'guild' | 'guildId'
>;

interface ResolvedTempTtsSource {
  textChannelId: string;
  voiceChannelId: string;
}

const acceptedMessageTimes = new Map<string, number>();

export function consumeTempTtsUserCooldown(
  guildId: string,
  userId: string,
  now = Date.now(),
): boolean {
  const key = `${guildId}:${userId}`;
  const lastAcceptedAt = acceptedMessageTimes.get(key);

  if (
    lastAcceptedAt !== undefined &&
    now - lastAcceptedAt < TEMP_TTS_USER_COOLDOWN_MS
  ) {
    return false;
  }

  acceptedMessageTimes.set(key, now);
  return true;
}

export function resetTempTtsUserCooldownsForTests(): void {
  acceptedMessageTimes.clear();
}

function isUnknownChannelError(error: unknown): error is { code: number } {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === 10003
  );
}

function normalizeTempTtsMessageContent(content: string): string {
  return content.trim().replace(/\s+/g, ' ');
}

async function fetchTrackedVoiceChannel(
  message: TempTtsIntakeMessage,
  voiceChannelId: string,
): Promise<unknown | null> {
  if (!message.guild) {
    return null;
  }

  let channel = null;

  try {
    channel = await message.guild.channels.fetch(voiceChannelId);
  } catch (error) {
    if (isUnknownChannelError(error)) {
      return null;
    }

    throw error;
  }

  if (!channel) {
    return null;
  }

  return channel;
}

function resolveTempTtsSource(
  message: TempTtsIntakeMessage,
): ResolvedTempTtsSource | null {
  const trackedVoiceRoom = findTempChannelByChannelId(message.channelId);

  if (trackedVoiceRoom) {
    return {
      textChannelId: message.channelId,
      voiceChannelId: trackedVoiceRoom.channelId,
    };
  }

  const linkedTextChannel = findTempTextChannelByTextChannelId(
    message.channelId,
  );

  if (!linkedTextChannel) {
    return null;
  }

  return {
    textChannelId: linkedTextChannel.textChannelId,
    voiceChannelId: linkedTextChannel.voiceChannelId,
  };
}

export async function resolveTempTtsMessageIntake(
  message: TempTtsIntakeMessage,
): Promise<TempTtsMessageIntakeResult> {
  if (!message.guildId || !message.guild) {
    return {
      status: 'skipped',
      reason: 'not_guild_message',
      authorId: message.author.id,
      textChannelId: message.channelId,
    };
  }

  if (message.author.bot) {
    return {
      status: 'skipped',
      reason: 'bot_author',
      guildId: message.guildId,
      authorId: message.author.id,
      textChannelId: message.channelId,
    };
  }

  const source = resolveTempTtsSource(message);

  if (!source) {
    return {
      status: 'skipped',
      reason: 'not_tracked_tts_channel',
      guildId: message.guildId,
      authorId: message.author.id,
      textChannelId: message.channelId,
    };
  }

  const trackedVoiceRoom = findTempChannelByChannelId(source.voiceChannelId);

  if (!trackedVoiceRoom) {
    return {
      status: 'skipped',
      reason: 'voice_room_not_tracked',
      guildId: message.guildId,
      authorId: message.author.id,
      textChannelId: source.textChannelId,
      voiceChannelId: source.voiceChannelId,
    };
  }

  const roomTtsSettings = findTempTtsSettingsByVoiceChannelId(
    trackedVoiceRoom.channelId,
  );

  if (!roomTtsSettings?.enabled) {
    return {
      status: 'skipped',
      reason: 'tts_disabled',
      guildId: message.guildId,
      authorId: message.author.id,
      textChannelId: source.textChannelId,
      voiceChannelId: trackedVoiceRoom.channelId,
    };
  }

  const normalizedContent = normalizeTempTtsMessageContent(message.content);

  if (normalizedContent.length === 0) {
    return {
      status: 'skipped',
      reason: 'empty_content',
      guildId: message.guildId,
      authorId: message.author.id,
      textChannelId: source.textChannelId,
      voiceChannelId: trackedVoiceRoom.channelId,
      messageLength: 0,
    };
  }

  if (normalizedContent.startsWith('/')) {
    return {
      status: 'skipped',
      reason: 'command_like',
      guildId: message.guildId,
      authorId: message.author.id,
      textChannelId: source.textChannelId,
      voiceChannelId: trackedVoiceRoom.channelId,
      messageLength: normalizedContent.length,
    };
  }

  if (normalizedContent.length > TEMP_TTS_MAX_MESSAGE_LENGTH) {
    return {
      status: 'skipped',
      reason: 'message_too_long',
      guildId: message.guildId,
      authorId: message.author.id,
      textChannelId: source.textChannelId,
      voiceChannelId: trackedVoiceRoom.channelId,
      messageLength: normalizedContent.length,
    };
  }

  const voiceChannel = await fetchTrackedVoiceChannel(
    message,
    trackedVoiceRoom.channelId,
  );

  if (!voiceChannel) {
    return {
      status: 'skipped',
      reason: 'voice_channel_missing',
      guildId: message.guildId,
      authorId: message.author.id,
      textChannelId: source.textChannelId,
      voiceChannelId: trackedVoiceRoom.channelId,
      messageLength: normalizedContent.length,
    };
  }

  if (
    typeof voiceChannel !== 'object' ||
    voiceChannel === null ||
    !('type' in voiceChannel) ||
    voiceChannel.type !== ChannelType.GuildVoice
  ) {
    return {
      status: 'skipped',
      reason: 'voice_channel_invalid',
      guildId: message.guildId,
      authorId: message.author.id,
      textChannelId: source.textChannelId,
      voiceChannelId: trackedVoiceRoom.channelId,
      messageLength: normalizedContent.length,
    };
  }

  const typedVoiceChannel = voiceChannel as VoiceChannel;

  if (typedVoiceChannel.members.size === 0) {
    return {
      status: 'skipped',
      reason: 'voice_channel_empty',
      guildId: message.guildId,
      authorId: message.author.id,
      textChannelId: source.textChannelId,
      voiceChannelId: trackedVoiceRoom.channelId,
      messageLength: normalizedContent.length,
    };
  }

  const authorVoiceChannelId = message.guild.voiceStates.cache.get(
    message.author.id,
  )?.channelId;

  if (authorVoiceChannelId !== trackedVoiceRoom.channelId) {
    return {
      status: 'skipped',
      reason: 'author_not_in_voice_channel',
      guildId: message.guildId,
      authorId: message.author.id,
      textChannelId: source.textChannelId,
      voiceChannelId: trackedVoiceRoom.channelId,
      messageLength: normalizedContent.length,
    };
  }

  return {
    status: 'accepted',
    guildId: message.guildId,
    textChannelId: source.textChannelId,
    voiceChannelId: trackedVoiceRoom.channelId,
    authorId: message.author.id,
    voiceKey: roomTtsSettings.voiceKey,
    content: normalizedContent,
  };
}
