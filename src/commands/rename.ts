import { SlashCommandBuilder } from 'discord.js';

import { buildPanelComponents, buildPanelEmbed, PanelServiceError, renamePanelChannel, resolvePanelTarget } from '../services/panelService';
import type { AppCommand } from '../types';
import { safeReply } from '../utils/safeReply';

export const renameCommand: AppCommand = {
  data: new SlashCommandBuilder()
    .setName('rename')
    .setDescription('Переименовать свою временную голосовую комнату.')
    .addStringOption((option) =>
      option
        .setName('name')
        .setDescription('Новое название комнаты')
        .setRequired(true)
        .setMinLength(1)
        .setMaxLength(50),
    ),
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
      const newName = interaction.options.getString('name', true);
      const updatedTarget = await renamePanelChannel(target, member, newName);
      const embed = await buildPanelEmbed(updatedTarget);

      context.logger.info({
        event: 'rename_command_used',
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
          event: 'rename_command_blocked',
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
        event: 'rename_command_failed',
        guildId: interaction.guild.id,
        userId: interaction.user.id,
      }, error);

      throw error;
    }
  },
};
