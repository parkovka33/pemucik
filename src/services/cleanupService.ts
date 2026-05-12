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
  | 'deleted';

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}

function isUnknownChannelError(error: unknown): error is { code: number } {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 10003;
}

export async function deleteTrackedTempChannelArtifacts(guild: Guild, channelId: string): Promise<void> {
  try {
    await deleteLinkedTempTextChannelForVoiceChannel(guild, channelId);
  } finally {
    await cleanupTempTtsPlaybackForVoiceChannel(guild.id, channelId);
    deleteTempChannelByChannelId(channelId);
  }
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
    await deleteTrackedTempChannelArtifacts(guild, channelId);

    return 'missing_channel';
  }

  if (!channel.isVoiceBased()) {
    return 'not_voice_channel';
  }

  const voiceChannel = channel as VoiceChannel;

  if (voiceChannel.members.size > 0) {
    return 'not_empty';
  }

  await voiceChannel.delete('Noi: удаление пустой временной комнаты');

  await deleteTrackedTempChannelArtifacts(guild, channelId);

  return 'deleted';
}
