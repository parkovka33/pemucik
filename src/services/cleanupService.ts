import type { Guild, VoiceChannel } from 'discord.js';

import { TEMP_CHANNEL_CLEANUP_DELAY_MS } from '../config/constants';
import {
  deleteTempChannelByChannelId,
  findTempChannelByChannelId,
} from '../db/repositories/tempChannelsRepo';
import { deleteLinkedTempTextChannelForVoiceChannel } from './tempTextChannelService';
import { cleanupTempTtsPlaybackForVoiceChannel } from './ttsPlaybackService';

export type CleanupTempChannelResult =
  | 'not_tracked'
  | 'missing_channel'
  | 'not_voice_channel'
  | 'not_empty'
  | 'deleted'
  | 'voice_delete_retry_required'
  | 'artifact_cleanup_retry_required';

export type TrackedArtifactCleanupResult =
  | {
      status: 'completed';
      linkedTextResult: 'not_linked' | 'missing_text_channel' | 'deleted';
    }
  | {
      status: 'not_tracked';
    }
  | {
      status: 'retry_required';
      stage: 'linked_text' | 'tts_playback' | 'parent_record';
      error: unknown;
    };

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}

function isUnknownChannelError(error: unknown): error is { code: number } {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 10003;
}

export async function deleteTrackedTempChannelArtifacts(
  guild: Guild,
  channelId: string,
): Promise<TrackedArtifactCleanupResult> {
  const trackedChannel = findTempChannelByChannelId(channelId);

  if (!trackedChannel || trackedChannel.guildId !== guild.id) {
    return { status: 'not_tracked' };
  }

  let linkedTextResult: 'not_linked' | 'missing_text_channel' | 'deleted';

  try {
    linkedTextResult = await deleteLinkedTempTextChannelForVoiceChannel(guild, channelId);
  } catch (error) {
    cleanupTempTtsPlaybackForVoiceChannel(guild.id, channelId);

    return {
      status: 'retry_required',
      stage: 'linked_text',
      error,
    };
  }

  try {
    cleanupTempTtsPlaybackForVoiceChannel(guild.id, channelId);
  } catch (error) {
    return {
      status: 'retry_required',
      stage: 'tts_playback',
      error,
    };
  }

  try {
    deleteTempChannelByChannelId(channelId);
  } catch (error) {
    return {
      status: 'retry_required',
      stage: 'parent_record',
      error,
    };
  }

  return {
    status: 'completed',
    linkedTextResult,
  };
}

export async function cleanupTrackedTempChannelIfEmpty(
  guild: Guild,
  channelId: string,
): Promise<CleanupTempChannelResult> {
  const trackedChannel = findTempChannelByChannelId(channelId);

  if (!trackedChannel) {
    return 'not_tracked';
  }

  await delay(TEMP_CHANNEL_CLEANUP_DELAY_MS);

  let channel = null;

  try {
    channel = await guild.channels.fetch(channelId);
  } catch (error) {
    if (!isUnknownChannelError(error)) {
      throw error;
    }
  }

  if (!channel) {
    const cleanupResult = await deleteTrackedTempChannelArtifacts(guild, channelId);

    return cleanupResult.status === 'completed'
      ? 'missing_channel'
      : 'artifact_cleanup_retry_required';
  }

  if (!channel.isVoiceBased()) {
    return 'not_voice_channel';
  }

  const voiceChannel = channel as VoiceChannel;

  if (voiceChannel.members.size > 0) {
    return 'not_empty';
  }

  try {
    await voiceChannel.delete('Pemucik: удаление пустой временной комнаты');
  } catch (error) {
    if (!isUnknownChannelError(error)) {
      return 'voice_delete_retry_required';
    }
  }

  const cleanupResult = await deleteTrackedTempChannelArtifacts(guild, channelId);

  return cleanupResult.status === 'completed'
    ? 'deleted'
    : 'artifact_cleanup_retry_required';
}
