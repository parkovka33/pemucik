import type { Client } from 'discord.js';

import { findGuildSettingsByGuildId } from '../db/repositories/guildSettingsRepo';
import { incrementMetricCounter } from '../db/repositories/metricsRepo';
import {
  countTempChannelsByGuildId,
  deleteTempChannelByChannelId,
  insertTempChannel,
} from '../db/repositories/tempChannelsRepo';
import { cleanupTrackedTempChannelIfEmpty } from '../services/cleanupService';
import { getCreateCooldownRemainingSeconds, startCreateCooldown } from '../services/cooldownService';
import { findOwnedTempChannel } from '../services/ownershipService';
import {
  TempChannelServiceError,
  createTempChannelForMember,
  moveMemberToChannel,
} from '../services/tempChannelService';
import { syncLinkedTempTextChannelForVoiceChannel } from '../services/tempTextChannelService';
import type { Logger } from '../utils/logger';

function isGeneratorJoin(oldChannelId: string | null, newChannelId: string | null): boolean {
  return oldChannelId !== newChannelId && newChannelId !== null;
}

function isChannelLeave(oldChannelId: string | null, newChannelId: string | null): boolean {
  return oldChannelId !== null && oldChannelId !== newChannelId;
}

export function registerVoiceStateUpdateHandler(client: Client, logger: Logger): void {
  client.on('voiceStateUpdate', async (oldState, newState) => {
    if (oldState.channelId === newState.channelId) {
      return;
    }

    if (isChannelLeave(oldState.channelId, newState.channelId) && oldState.channelId) {
      try {
        await syncLinkedTempTextChannelForVoiceChannel(oldState.guild, oldState.channelId);
      } catch (error) {
        logger.error({
          event: 'linked_temp_text_channel_sync_failed_on_leave',
          guildId: oldState.guild.id,
          voiceChannelId: oldState.channelId,
        }, error);
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
        }
      } catch (error) {
        logger.error({
          event: 'temp_channel_cleanup_failed',
          guildId: oldState.guild.id,
          channelId: oldState.channelId,
        }, error);
      }
    }

    if (!isGeneratorJoin(oldState.channelId, newState.channelId)) {
      return;
    }

    if (!newState.member || newState.member.user.bot || !newState.channel) {
      return;
    }

    if (newState.channelId) {
      try {
        await syncLinkedTempTextChannelForVoiceChannel(newState.guild, newState.channelId);
      } catch (error) {
        logger.error({
          event: 'linked_temp_text_channel_sync_failed_on_join',
          guildId: newState.guild.id,
          voiceChannelId: newState.channelId,
        }, error);
      }
    }

    const settings = findGuildSettingsByGuildId(newState.guild.id);

    if (!settings || newState.channelId !== settings.generatorChannelId) {
      return;
    }

    if (newState.member.voice.channelId !== settings.generatorChannelId) {
      return;
    }

    const cooldownRemainingSeconds = getCreateCooldownRemainingSeconds(
      newState.guild.id,
      newState.member.id,
    );

    if (cooldownRemainingSeconds > 0) {
      logger.warn({
        event: 'temp_channel_create_cooldown_active',
        guildId: newState.guild.id,
        userId: newState.member.id,
        remainingSeconds: cooldownRemainingSeconds,
      });
      return;
    }

    const existingTempChannel = findOwnedTempChannel(newState.guild.id, newState.member.id);

    if (existingTempChannel) {
      const existingChannel = await newState.guild.channels.fetch(existingTempChannel.channelId);

      if (existingChannel?.isVoiceBased()) {
        try {
          await newState.member.voice.setChannel(existingChannel);
          logger.info({
            event: 'temp_channel_reused',
            guildId: newState.guild.id,
            userId: newState.member.id,
            channelId: existingTempChannel.channelId,
          });
          return;
        } catch (error) {
          logger.warn({
            event: 'temp_channel_reuse_failed',
            guildId: newState.guild.id,
            userId: newState.member.id,
            channelId: existingTempChannel.channelId,
            error: error instanceof Error ? error.message : String(error),
          });
          return;
        }
      } else {
        deleteTempChannelByChannelId(existingTempChannel.channelId);
      }
    }

    const tempChannelCount = countTempChannelsByGuildId(newState.guild.id);

    if (tempChannelCount >= settings.maxTempChannels) {
      logger.warn({
        event: 'temp_channel_limit_reached',
        guildId: newState.guild.id,
        userId: newState.member.id,
        maxTempChannels: settings.maxTempChannels,
      });
      return;
    }

    try {
      if (newState.member.voice.channelId !== settings.generatorChannelId) {
        return;
      }

      startCreateCooldown(newState.guild.id, newState.member.id);

      const tempChannel = await createTempChannelForMember(newState.member, settings);

      try {
        if (newState.member.voice.channelId !== settings.generatorChannelId) {
          await tempChannel.delete('Noi: удаление временной комнаты после выхода пользователя из генератора до переноса');
          return;
        }

        await moveMemberToChannel(newState.member, tempChannel);
      } catch (error) {
        await tempChannel.delete('Noi: удаление временной комнаты после неудачного переноса пользователя');
        throw error;
      }

      insertTempChannel({
        channelId: tempChannel.id,
        guildId: newState.guild.id,
        ownerUserId: newState.member.id,
        categoryId: settings.categoryId,
        userLimit: tempChannel.userLimit,
      });

      incrementMetricCounter(newState.guild.id, 'channels_created');

      logger.info({
        event: 'temp_channel_created',
        guildId: newState.guild.id,
        userId: newState.member.id,
        channelId: tempChannel.id,
      });
    } catch (error) {
      if (error instanceof TempChannelServiceError) {
        logger.warn({
          event: 'temp_channel_create_blocked',
          guildId: newState.guild.id,
          userId: newState.member.id,
          code: error.code,
          message: error.message,
        });
        incrementMetricCounter(newState.guild.id, 'creation_failed');
        return;
      }

      logger.error({
        event: 'temp_channel_create_failed',
        guildId: newState.guild.id,
        userId: newState.member.id,
      }, error);
      incrementMetricCounter(newState.guild.id, 'creation_failed');
    }
  });
}
