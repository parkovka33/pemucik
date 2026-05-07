import type { Client } from 'discord.js';

import { listGuildSettingsWithInterface } from '../db/repositories/guildSettingsRepo';
import { ensurePersistentInterface, InterfaceServiceError } from '../services/interfaceService';
import type { Logger } from '../utils/logger';

export function registerReadyHandler(client: Client, logger: Logger): void {
  client.once('clientReady', (readyClient) => {
    logger.info({
      event: 'bot_ready',
      message: 'XenoVoice is online.',
      userTag: readyClient.user.tag,
      userId: readyClient.user.id,
    });

    void restorePersistentInterfaces(readyClient, logger);
  });
}

async function restorePersistentInterfaces(client: Client, logger: Logger): Promise<void> {
  const configuredGuilds = listGuildSettingsWithInterface();

  for (const settings of configuredGuilds) {
    const guild = client.guilds.cache.get(settings.guildId);

    if (!guild) {
      logger.warn({
        event: 'persistent_interface_restore_skipped',
        guildId: settings.guildId,
        message: 'Saved interface metadata exists, but the guild is not available in cache.',
      });
      continue;
    }

    try {
      const result = await ensurePersistentInterface(guild);

      logger.info({
        event: 'persistent_interface_restored',
        guildId: guild.id,
        channelId: result.channelId,
        messageId: result.messageId,
      });
    } catch (error) {
      if (error instanceof InterfaceServiceError) {
        logger.warn({
          event: 'persistent_interface_restore_blocked',
          guildId: guild.id,
          code: error.code,
          message: error.message,
        });
        continue;
      }

      logger.error({
        event: 'persistent_interface_restore_failed',
        guildId: guild.id,
      }, error);
    }
  }
}
