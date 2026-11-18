import type { Client } from 'discord.js';

import {
  consumeTempTtsUserCooldown,
  resolveTempTtsMessageIntake,
} from '../services/ttsIntakeService';
import { enqueueTempTtsPlayback } from '../services/ttsPlaybackService';
import type { Logger } from '../utils/logger';

const QUIET_SKIP_REASONS = new Set([
  'not_guild_message',
  'bot_author',
  'not_tracked_tts_channel',
]);

export function registerMessageCreateHandler(
  client: Client,
  logger: Logger,
): void {
  client.on('messageCreate', async (message) => {
    try {
      const result = await resolveTempTtsMessageIntake(message);

      if (result.status === 'skipped') {
        if (QUIET_SKIP_REASONS.has(result.reason)) {
          return;
        }

        logger.debug({
          event: 'voice_tts_message_skipped',
          reason: result.reason,
          guildId: result.guildId,
          userId: result.authorId,
          textChannelId: result.textChannelId,
          voiceChannelId: result.voiceChannelId,
          messageLength: result.messageLength,
        });
        return;
      }

      const guild = message.guild;

      if (!guild) {
        return;
      }

      if (!consumeTempTtsUserCooldown(result.guildId, result.authorId)) {
        logger.debug({
          event: 'voice_tts_message_skipped',
          reason: 'rate_limited',
          guildId: result.guildId,
          userId: result.authorId,
          textChannelId: result.textChannelId,
          voiceChannelId: result.voiceChannelId,
          messageLength: result.content.length,
        });
        return;
      }

      logger.info({
        event: 'voice_tts_message_ready',
        guildId: result.guildId,
        userId: result.authorId,
        textChannelId: result.textChannelId,
        voiceChannelId: result.voiceChannelId,
        voiceKey: result.voiceKey,
        messageLength: result.content.length,
      });

      enqueueTempTtsPlayback(guild, result, logger);
    } catch (error) {
      logger.error(
        {
          event: 'voice_tts_message_intake_failed',
          guildId: message.guildId ?? undefined,
          userId: message.author?.id,
          textChannelId: message.channelId,
        },
        error,
      );
    }
  });
}
