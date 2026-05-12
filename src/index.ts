import { createDiscordClient } from './client/discordClient';
import { getEnv } from './config/env';
import { closeDatabase, getDatabase } from './db/database';
import { registerChannelDeleteHandler } from './events/channelDelete';
import { registerInteractionCreateHandler } from './events/interactionCreate';
import { registerReadyHandler } from './events/ready';
import { registerVoiceStateUpdateHandler } from './events/voiceStateUpdate';
import { destroyAllTempTtsPlayback } from './services/ttsPlaybackService';
import { Logger } from './utils/logger';

async function bootstrap(): Promise<void> {
  const env = getEnv();
  const logger = new Logger(env.logLevel);
  const client = createDiscordClient();

  getDatabase();

  registerReadyHandler(client, logger);
  registerInteractionCreateHandler(client, logger);
  registerChannelDeleteHandler(client, logger);
  registerVoiceStateUpdateHandler(client, logger);

  process.on('SIGINT', () => {
    logger.info({
      event: 'process_signal',
      signal: 'SIGINT',
      message: 'Shutting down Noi.',
    });
    destroyAllTempTtsPlayback(logger);
    closeDatabase();
    void client.destroy();
    process.exit(0);
  });

  process.on('SIGTERM', () => {
    logger.info({
      event: 'process_signal',
      signal: 'SIGTERM',
      message: 'Shutting down Noi.',
    });
    destroyAllTempTtsPlayback(logger);
    closeDatabase();
    void client.destroy();
    process.exit(0);
  });

  try {
    await client.login(env.discordToken);
  } catch (error) {
    logger.error({
      event: 'startup_failed',
      message: 'Failed to start Noi.',
    }, error);
    closeDatabase();
    throw error;
  }
}

bootstrap().catch((error: unknown) => {
  console.error('Fatal startup error.', error);
  process.exitCode = 1;
});
