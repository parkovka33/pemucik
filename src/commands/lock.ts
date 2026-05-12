import { SlashCommandBuilder } from 'discord.js';

import { buildPanelComponents, buildPanelEmbed, lockPanelChannel, PanelServiceError, resolvePanelTarget } from '../services/panelService';
import type { AppCommand } from '../types';
import { safeReply } from '../utils/safeReply';

export const lockCommand: AppCommand = {
  data: new SlashCommandBuilder()
    .setName('lock')
    .setDescription('Закрыть свою временную голосовую комнату для новых подключений.'),
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
      const updatedTarget = await lockPanelChannel(target);
      const embed = await buildPanelEmbed(updatedTarget);

      context.logger.info({
        event: 'lock_command_used',
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
          event: 'lock_command_blocked',
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
        event: 'lock_command_failed',
        guildId: interaction.guild.id,
        userId: interaction.user.id,
      }, error);

      throw error;
    }
  },
};
