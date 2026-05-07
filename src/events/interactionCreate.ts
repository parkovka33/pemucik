import type { Client } from 'discord.js';

import { commandMap } from '../commands';
import {
  handlePersistentInterfaceInteraction,
  matchesPersistentInterfaceInteraction,
} from '../interactions/interfaceInteractions';
import { handlePanelInteraction, matchesPanelInteraction } from '../interactions/panelInteractions';
import type { CommandExecutionContext } from '../types';
import { safeReply } from '../utils/safeReply';
import type { Logger } from '../utils/logger';

export function registerInteractionCreateHandler(client: Client, logger: Logger): void {
  client.on('interactionCreate', async (interaction) => {
    const context: CommandExecutionContext = {
      logger,
    };

    if (
      (interaction.isButton() || interaction.isStringSelectMenu() || interaction.isModalSubmit())
      && matchesPersistentInterfaceInteraction(interaction.customId)
    ) {
      await handlePersistentInterfaceInteraction(interaction, context);
      return;
    }

    if (
      (interaction.isButton() || interaction.isStringSelectMenu() || interaction.isModalSubmit())
      && matchesPanelInteraction(interaction.customId)
    ) {
      await handlePanelInteraction(interaction, context);
      return;
    }

    if (interaction.isAutocomplete()) {
      const command = commandMap.get(interaction.commandName);

      if (!command?.autocomplete) {
        await interaction.respond([]);
        return;
      }

      try {
        await command.autocomplete(interaction, context);
      } catch (error) {
        const focused = interaction.options.getFocused(true);

        logger.error({
          event: 'autocomplete_failed',
          commandName: interaction.commandName,
          subcommand: interaction.options.getSubcommand(false) ?? undefined,
          optionName: focused.name,
          optionValue: String(focused.value),
          guildId: interaction.guildId ?? undefined,
          userId: interaction.user.id,
        }, error);

        if (!interaction.responded) {
          await interaction.respond([]);
        }
      }
      return;
    }

    if (!interaction.isChatInputCommand()) {
      return;
    }

    const command = commandMap.get(interaction.commandName);

    if (!command) {
      logger.warn({
        event: 'unknown_command',
        commandName: interaction.commandName,
        guildId: interaction.guildId ?? undefined,
        userId: interaction.user.id,
      });

      await safeReply(interaction, {
        content: 'Неизвестная команда.',
        ephemeral: true,
      });
      return;
    }

    try {
      await command.execute(interaction, context);
    } catch (error) {
      logger.error({
        event: 'command_execution_failed',
        commandName: interaction.commandName,
        guildId: interaction.guildId ?? undefined,
        userId: interaction.user.id,
      }, error);

      await safeReply(interaction, {
        content: 'Во время обработки этой команды произошла ошибка.',
        ephemeral: true,
      });
    }
  });
}
