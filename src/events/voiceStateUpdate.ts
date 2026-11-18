import type { Client } from 'discord.js';

import { findGuildSettingsByGuildId } from '../db/repositories/guildSettingsRepo';
import { incrementMetricCounter } from '../db/repositories/metricsRepo';
import { countTempChannelsByGuildId } from '../db/repositories/tempChannelsRepo';
import {
  cleanupTrackedTempChannelIfEmpty,
  deleteTrackedTempChannelArtifacts,
} from '../services/cleanupService';
import {
  getCreateCooldownRemainingSeconds,
  startCreateCooldown,
} from '../services/cooldownService';
import { findOwnedTempChannel } from '../services/ownershipService';
import { createTrackedTempChannelForMember } from '../services/tempChannelCreationService';
import { TempChannelServiceError } from '../services/tempChannelService';
import { syncLinkedTempTextChannelForVoiceChannel } from '../services/tempTextChannelService';
import type { Logger } from '../utils/logger';
import { KeyedSerialExecutor } from '../utils/keyedSerialExecutor';

const tempChannelCreationExecutor = new KeyedSerialExecutor();

function isGeneratorJoin(
  oldChannelId: string | null,
  newChannelId: string | null,
): boolean {
  return oldChannelId !== newChannelId && newChannelId !== null;
}

function isChannelLeave(
  oldChannelId: string | null,
  newChannelId: string | null,
): boolean {
  return oldChannelId !== null && oldChannelId !== newChannelId;
}

export function registerVoiceStateUpdateHandler(
  client: Client,
  logger: Logger,
): void {
  client.on('voiceStateUpdate', async (oldState, newState) => {
    if (oldState.channelId === newState.channelId) {
      return;
    }

    if (
      isChannelLeave(oldState.channelId, newState.channelId) &&
      oldState.channelId
    ) {
      try {
        await syncLinkedTempTextChannelForVoiceChannel(
          oldState.guild,
          oldState.channelId,
        );
      } catch (error) {
        logger.error(
          {
            event: 'linked_temp_text_channel_sync_failed_on_leave',
            guildId: oldState.guild.id,
            voiceChannelId: oldState.channelId,
          },
          error,
        );
      }

      try {
        const cleanupResult = await cleanupTrackedTempChannelIfEmpty(
          oldState.guild,
          oldState.channelId,
        );

        if (cleanupResult === 'deleted') {
          incrementMetricCounter(oldState.guild.id, 'channels_deleted');
          logger.info({
            event: 'temp_channel_deleted',
            guildId: oldState.guild.id,
            channelId: oldState.channelId,
          });
        } else if (
          cleanupResult === 'voice_delete_retry_required'
          || cleanupResult === 'artifact_cleanup_retry_required'
        ) {
          logger.warn({
            event: 'temp_channel_cleanup_retry_required',
            guildId: oldState.guild.id,
            channelId: oldState.channelId,
            cleanupResult,
          });
        }
      } catch (error) {
        logger.error(
          {
            event: 'temp_channel_cleanup_failed',
            guildId: oldState.guild.id,
            channelId: oldState.channelId,
          },
          error,
        );
      }
    }

    if (!isGeneratorJoin(oldState.channelId, newState.channelId)) {
      return;
    }

    const member = newState.member;

    if (!member || member.user.bot || !newState.channel) {
      return;
    }

    if (newState.channelId) {
      try {
        await syncLinkedTempTextChannelForVoiceChannel(
          newState.guild,
          newState.channelId,
        );
      } catch (error) {
        logger.error(
          {
            event: 'linked_temp_text_channel_sync_failed_on_join',
            guildId: newState.guild.id,
            voiceChannelId: newState.channelId,
          },
          error,
        );
      }
    }

    const settings = findGuildSettingsByGuildId(newState.guild.id);

    if (!settings || newState.channelId !== settings.generatorChannelId) {
      return;
    }

    if (member.voice.channelId !== settings.generatorChannelId) {
      return;
    }

    await tempChannelCreationExecutor.run(newState.guild.id, async () => {
      const cooldownRemainingSeconds = getCreateCooldownRemainingSeconds(
        newState.guild.id,
        member.id,
      );

      if (cooldownRemainingSeconds > 0) {
        logger.warn({
          event: 'temp_channel_create_cooldown_active',
          guildId: newState.guild.id,
          userId: member.id,
          remainingSeconds: cooldownRemainingSeconds,
        });
        return;
      }

      const existingTempChannel = findOwnedTempChannel(
        newState.guild.id,
        member.id,
      );

      if (existingTempChannel) {
        const existingChannel = await newState.guild.channels.fetch(
          existingTempChannel.channelId,
        );

        if (existingChannel?.isVoiceBased()) {
          try {
            await member.voice.setChannel(existingChannel);
            logger.info({
              event: 'temp_channel_reused',
              guildId: newState.guild.id,
              userId: member.id,
              channelId: existingTempChannel.channelId,
            });
            return;
          } catch (error) {
            logger.warn({
              event: 'temp_channel_reuse_failed',
              guildId: newState.guild.id,
              userId: member.id,
              channelId: existingTempChannel.channelId,
              error: error instanceof Error ? error.message : String(error),
            });
            return;
          }
        } else {
          const cleanupResult = await deleteTrackedTempChannelArtifacts(
            newState.guild,
            existingTempChannel.channelId,
          );

          if (cleanupResult.status !== 'completed') {
            logger.warn({
              event: 'stale_temp_channel_cleanup_retry_required',
              guildId: newState.guild.id,
              userId: member.id,
              channelId: existingTempChannel.channelId,
              cleanupStatus: cleanupResult.status,
            });
            return;
          }
        }
      }

      const tempChannelCount = countTempChannelsByGuildId(newState.guild.id);

      if (tempChannelCount >= settings.maxTempChannels) {
        logger.warn({
          event: 'temp_channel_limit_reached',
          guildId: newState.guild.id,
          userId: member.id,
          maxTempChannels: settings.maxTempChannels,
        });
        return;
      }

      try {
        if (member.voice.channelId !== settings.generatorChannelId) {
          return;
        }

        startCreateCooldown(newState.guild.id, member.id);

        const creationResult = await createTrackedTempChannelForMember(member, settings);

        if (creationResult.status === 'member_left_before_create') {
          return;
        }

        if (creationResult.status === 'orphaned_untracked') {
          logger.error(
            {
              event: 'temp_channel_orphaned_untracked',
              guildId: newState.guild.id,
              userId: member.id,
              channelId: creationResult.channelId,
              conflictingChannelId: creationResult.conflictingChannelId ?? 'none',
            },
            creationResult.cause,
          );
          incrementMetricCounter(newState.guild.id, 'creation_failed');
          return;
        }

        if (creationResult.status === 'compensation_retry_required') {
          logger.error(
            {
              event: 'temp_channel_creation_compensation_retry_required',
              guildId: newState.guild.id,
              userId: member.id,
              channelId: creationResult.channelId,
              reason: creationResult.reason,
              stage: creationResult.stage,
            },
            creationResult.cause,
          );
          incrementMetricCounter(newState.guild.id, 'creation_failed');
          return;
        }

        if (creationResult.status === 'compensated') {
          logger.warn({
            event: 'temp_channel_creation_compensated',
            guildId: newState.guild.id,
            userId: member.id,
            channelId: creationResult.channelId,
            reason: creationResult.reason,
          });
          incrementMetricCounter(newState.guild.id, 'creation_failed');
          return;
        }

        incrementMetricCounter(newState.guild.id, 'channels_created');

        logger.info({
          event: 'temp_channel_created',
          guildId: newState.guild.id,
          userId: member.id,
          channelId: creationResult.channel.id,
        });
      } catch (error) {
        if (error instanceof TempChannelServiceError) {
          logger.warn({
            event: 'temp_channel_create_blocked',
            guildId: newState.guild.id,
            userId: member.id,
            code: error.code,
            message: error.message,
          });
          incrementMetricCounter(newState.guild.id, 'creation_failed');
          return;
        }

        logger.error(
          {
            event: 'temp_channel_create_failed',
            guildId: newState.guild.id,
            userId: member.id,
          },
          error,
        );
        incrementMetricCounter(newState.guild.id, 'creation_failed');
      }
    });
  });
}
