import { SlashCommandBuilder } from 'discord.js';

import { buildPanelComponents, buildPanelEmbed, PanelServiceError, resolvePanelTarget, unlockPanelChannel } from '../services/panelService';
import type { AppCommand } from '../types';
import { safeReply } from '../utils/safeReply';

export const unlockCommand: AppCommand = {
  data: new SlashCommandBuilder()
    .setName('unlock')
    .setDescription('Открыть свою временную голосовую комнату для новых подключений.'),
  async execute(interaction, context) {
    if (!interaction.inGuild() || !interaction.guild) {
      await safeReply(interaction, {
        content: 'Эту команду можно использовать только внутри сервера.',
        ephemeral: true,
      });
      return;
    }

    try {
      const member = await interaction.guild.members.fetch(interaction.user.id);
      const target = await resolvePanelTarget(member);
      const updatedTarget = await unlockPanelChannel(target);
      const embed = await buildPanelEmbed(updatedTarget);

      context.logger.info({
        event: 'unlock_command_used',
        guildId: interaction.guild.id,
        userId: interaction.user.id,
        channelId: updatedTarget.channel.id,
      });

      await safeReply(interaction, {
        embeds: [embed],
        components: buildPanelComponents(updatedTarget),
        ephemeral: true,
      });
    } catch (error) {
      if (error instanceof PanelServiceError) {
        context.logger.warn({
          event: 'unlock_command_blocked',
          guildId: interaction.guild.id,
          userId: interaction.user.id,
          code: error.code,
          message: error.message,
        });

        await safeReply(interaction, {
          content: error.message,
          ephemeral: true,
        });
        return;
      }

      context.logger.error({
        event: 'unlock_command_failed',
        guildId: interaction.guild.id,
        userId: interaction.user.id,
      }, error);

      throw error;
    }
  },
};
