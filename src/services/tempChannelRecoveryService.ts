import { ChannelType, type Guild, type VoiceChannel } from 'discord.js';

import {
  deleteTempTextChannelByTextChannelId,
  findTempTextChannelByTextChannelId,
} from '../db/repositories/tempTextChannelsRepo';
import {
  findTempChannelByChannelId,
  listTempChannelsByGuildId,
} from '../db/repositories/tempChannelsRepo';
import {
  cleanupTrackedTempChannelIfEmpty,
  deleteTrackedTempChannelArtifacts,
} from './cleanupService';
import { syncLinkedTempTextChannelForVoiceChannel } from './tempTextChannelService';

function isUnknownChannelError(error: unknown): error is { code: number } {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 10003;
}

async function fetchRecoverableVoiceChannel(guild: Guild, channelId: string): Promise<VoiceChannel | null> {
  try {
    const channel = await guild.channels.fetch(channelId);

    if (!channel || channel.type !== ChannelType.GuildVoice) {
      return null;
    }

    return channel as VoiceChannel;
  } catch (error) {
    if (isUnknownChannelError(error)) {
      return null;
    }

    throw error;
  }
}

export interface StartupTempChannelRecoverySummary {
  scanned: number;
  removedStale: number;
  retryPending: number;
  checkedEmpty: number;
  deletedEmpty: number;
  syncedLinkedText: number;
}

export async function recoverTrackedTempChannelsForGuild(
  guild: Guild,
): Promise<StartupTempChannelRecoverySummary> {
  const trackedChannels = listTempChannelsByGuildId(guild.id);
  const emptyTrackedChannelIds: string[] = [];
  const summary: StartupTempChannelRecoverySummary = {
    scanned: trackedChannels.length,
    removedStale: 0,
    retryPending: 0,
    checkedEmpty: 0,
    deletedEmpty: 0,
    syncedLinkedText: 0,
  };

  for (const trackedChannel of trackedChannels) {
    const voiceChannel = await fetchRecoverableVoiceChannel(guild, trackedChannel.channelId);

    if (!voiceChannel) {
      const cleanupResult = await deleteTrackedTempChannelArtifacts(guild, trackedChannel.channelId);

      if (cleanupResult.status === 'completed') {
        summary.removedStale += 1;
      } else {
        summary.retryPending += 1;
      }

      continue;
    }

    if (voiceChannel.members.size === 0) {
      emptyTrackedChannelIds.push(trackedChannel.channelId);
      continue;
    }

    const syncResult = await syncLinkedTempTextChannelForVoiceChannel(guild, trackedChannel.channelId);

    if (syncResult === 'synced') {
      summary.syncedLinkedText += 1;
    }
  }

  const emptyResults = await Promise.all(
    emptyTrackedChannelIds.map((channelId) => cleanupTrackedTempChannelIfEmpty(guild, channelId)),
  );

  summary.checkedEmpty = emptyResults.length;
  summary.deletedEmpty = emptyResults.filter((result) => result === 'deleted').length;
  summary.retryPending += emptyResults.filter((result) =>
    result === 'voice_delete_retry_required' || result === 'artifact_cleanup_retry_required'
  ).length;

  return summary;
}

export async function cleanupDeletedTrackedVoiceChannel(
  guild: Guild,
  channelId: string,
): ReturnType<typeof deleteTrackedTempChannelArtifacts> {
  const trackedChannel = findTempChannelByChannelId(channelId);

  if (!trackedChannel) {
    return Promise.resolve({ status: 'not_tracked' });
  }

  return deleteTrackedTempChannelArtifacts(guild, channelId);
}

export function cleanupDeletedTrackedTextChannel(textChannelId: string): boolean {
  const trackedTextChannel = findTempTextChannelByTextChannelId(textChannelId);

  if (!trackedTextChannel) {
    return false;
  }

  deleteTempTextChannelByTextChannelId(textChannelId);
  return true;
}
