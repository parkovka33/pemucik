import type { Client } from 'discord.js';

import { recoverTrackedTempChannelsForGuild } from '../services/tempChannelRecoveryService';
import type { Logger } from '../utils/logger';

export function registerReadyHandler(client: Client, logger: Logger): void {
  client.once('clientReady', (readyClient) => {
    logger.info({
      event: 'bot_ready',
      message: 'Pemucik is online.',
      userTag: readyClient.user.tag,
      userId: readyClient.user.id,
    });

    void recoverTrackedTempChannels(readyClient, logger);
  });
}

async function recoverTrackedTempChannels(client: Client, logger: Logger): Promise<void> {
  for (const guild of client.guilds.cache.values()) {
    try {
      const summary = await recoverTrackedTempChannelsForGuild(guild);

      if (summary.scanned === 0) {
        continue;
      }

      logger.info({
        event: 'startup_temp_channel_recovery_completed',
        guildId: guild.id,
        scanned: summary.scanned,
        removedStale: summary.removedStale,
        retryPending: summary.retryPending,
        checkedEmpty: summary.checkedEmpty,
        deletedEmpty: summary.deletedEmpty,
        syncedLinkedText: summary.syncedLinkedText,
      });
    } catch (error) {
      logger.error({
        event: 'startup_temp_channel_recovery_failed',
        guildId: guild.id,
      }, error);
    }
  }
}
