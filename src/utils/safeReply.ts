import type {
  InteractionEditReplyOptions,
  InteractionReplyOptions,
  RepliableInteraction,
} from 'discord.js';

import type { Logger } from './logger';

function isIgnorableInteractionResponseError(
  error: unknown,
): error is { code: number } {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error.code === 10062 || error.code === 40060)
  );
}

export async function safeReply(
  interaction: RepliableInteraction,
  options: string | InteractionReplyOptions,
  logger?: Pick<Logger, 'warn'>,
): Promise<void> {
  try {
    if (interaction.deferred && !interaction.replied) {
      if (typeof options === 'string') {
        await interaction.editReply(options);
        return;
      }

      const editOptions = { ...options };
      delete editOptions.ephemeral;
      delete editOptions.flags;
      await interaction.editReply(editOptions as InteractionEditReplyOptions);
      return;
    }

    if (interaction.replied) {
      await interaction.followUp(options);
      return;
    }

    await interaction.reply(options);
  } catch (error) {
    if (isIgnorableInteractionResponseError(error)) {
      logger?.warn({
        event:
          error.code === 10062
            ? 'interaction_response_expired'
            : 'interaction_response_already_acknowledged',
        interactionId: interaction.id,
        guildId: interaction.guildId ?? undefined,
        userId: interaction.user.id,
        errorCode: error.code,
      });
      return;
    }

    throw error;
  }
}
