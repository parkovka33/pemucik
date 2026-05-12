import { EmbedBuilder, SlashCommandBuilder } from 'discord.js';

import { PanelServiceError, buildPanelComponents, buildPanelEmbed, resolvePanelTarget } from '../services/panelService';
import type { AppCommand } from '../types';
import { applyBotAvatarEmbedColor } from '../utils/embedColor';
import { safeReply } from '../utils/safeReply';

export const panelCommand: AppCommand = {
  data: new SlashCommandBuilder()
    .setName('panel')
    .setDescription('Открыть панель управления комнатой Noi.'),
  async execute(interaction, context) {
    if (!interaction.inGuild() || !interaction.guild || !interaction.member) {
      await safeReply(interaction, {
        content: 'Эту команду можно использовать только внутри сервера.',
        ephemeral: true,
      });
      return;
    }

    try {
      const member = await interaction.guild.members.fetch(interaction.user.id);
      const target = await resolvePanelTarget(member);
      const embed = await buildPanelEmbed(target);

      await safeReply(interaction, {
        embeds: [embed],
        components: buildPanelComponents(target),
        ephemeral: true,
      });
    } catch (error) {
      if (error instanceof PanelServiceError) {
        await safeReply(interaction, {
          content: error.message,
          ephemeral: true,
        });

        context.logger.warn({
          event: 'panel_open_blocked',
          guildId: interaction.guild.id,
          userId: interaction.user.id,
          code: error.code,
          message: error.message,
        });
        return;
      }

      context.logger.error({
        event: 'panel_open_failed',
        guildId: interaction.guild.id,
        userId: interaction.user.id,
      }, error);

      const embed = await applyBotAvatarEmbedColor(new EmbedBuilder()
        .setTitle('Панель Noi временно недоступна')
        .setDescription('При открытии панели управления произошла ошибка.'), interaction.client);

      await safeReply(interaction, { embeds: [embed], ephemeral: true });
    }
  },
};
