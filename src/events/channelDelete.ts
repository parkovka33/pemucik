import { ChannelType, type Client } from 'discord.js';

import {
  cleanupDeletedTrackedTextChannel,
  cleanupDeletedTrackedVoiceChannel,
} from '../services/tempChannelRecoveryService';
import type { Logger } from '../utils/logger';

export function registerChannelDeleteHandler(client: Client, logger: Logger): void {
  client.on('channelDelete', async (channel) => {
    if (!('guild' in channel)) {
      return;
    }

    try {
      if (channel.type === ChannelType.GuildVoice) {
        const cleanupResult = await cleanupDeletedTrackedVoiceChannel(channel.guild, channel.id);

        if (cleanupResult.status === 'completed') {
          logger.info({
            event: 'tracked_temp_voice_channel_deleted_recovered',
            guildId: channel.guild.id,
            channelId: channel.id,
          });
        } else if (cleanupResult.status === 'retry_required') {
          logger.warn({
            event: 'tracked_temp_voice_channel_cleanup_retry_required',
            guildId: channel.guild.id,
            channelId: channel.id,
            stage: cleanupResult.stage,
            error: cleanupResult.error instanceof Error
              ? cleanupResult.error.message
              : String(cleanupResult.error),
          });
        }

        return;
      }

      if (channel.type === ChannelType.GuildText) {
        const cleaned = cleanupDeletedTrackedTextChannel(channel.id);

        if (cleaned) {
          logger.info({
            event: 'tracked_temp_text_channel_deleted_recovered',
            guildId: channel.guild.id,
            channelId: channel.id,
          });
        }
      }
    } catch (error) {
      logger.error({
        event: 'channel_delete_recovery_failed',
        guildId: channel.guild.id,
        channelId: channel.id,
        channelType: channel.type,
      }, error);
    }
  });
}
