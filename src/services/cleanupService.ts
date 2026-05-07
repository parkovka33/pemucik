import type { Guild, VoiceChannel } from 'discord.js';

import { TEMP_CHANNEL_CLEANUP_DELAY_MS } from '../config/constants';
import {
  deleteTempChannelByChannelId,
  findTempChannelByChannelId,
} from '../db/repositories/tempChannelsRepo';
import { deleteLinkedTempTextChannelForVoiceChannel } from './tempTextChannelService';

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

export async function cleanupTrackedTempChannelIfEmpty(
  guild: Guild,
  channelId: string,
): Promise<CleanupTempChannelResult> {
  const trackedChannel = findTempChannelByChannelId(channelId);

  if (!trackedChannel) {
    return 'not_tracked';
  }

  await delay(TEMP_CHANNEL_CLEANUP_DELAY_MS);

  const channel = await guild.channels.fetch(channelId);

  if (!channel) {
    try {
      await deleteLinkedTempTextChannelForVoiceChannel(guild, channelId);
    } finally {
      deleteTempChannelByChannelId(channelId);
    }

    return 'missing_channel';
  }

  if (!channel.isVoiceBased()) {
    return 'not_voice_channel';
  }

  const voiceChannel = channel as VoiceChannel;

  if (voiceChannel.members.size > 0) {
    return 'not_empty';
  }

  await voiceChannel.delete('XenoVoice: удаление пустой временной комнаты');

  try {
    await deleteLinkedTempTextChannelForVoiceChannel(guild, channelId);
  } finally {
    deleteTempChannelByChannelId(channelId);
  }

  return 'deleted';
}
