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
        const cleaned = await cleanupDeletedTrackedVoiceChannel(channel.guild, channel.id);

        if (cleaned) {
          logger.info({
            event: 'tracked_temp_voice_channel_deleted_recovered',
            guildId: channel.guild.id,
            channelId: channel.id,
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
