import { EmbedBuilder, SlashCommandBuilder } from 'discord.js';

import { APP_COLOR } from '../config/constants';
import { PanelServiceError, buildPanelComponents, buildPanelEmbed, resolvePanelTarget } from '../services/panelService';
import type { AppCommand } from '../types';
import { safeReply } from '../utils/safeReply';

export const panelCommand: AppCommand = {
  data: new SlashCommandBuilder()
    .setName('panel')
    .setDescription('Открыть панель управления комнатой XenoVoice.'),
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

      await safeReply(interaction, {
        embeds: [buildPanelEmbed(target)],
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

      const embed = new EmbedBuilder()
        .setColor(APP_COLOR)
        .setTitle('Панель XenoVoice временно недоступна')
        .setDescription('При открытии панели управления произошла ошибка.');

      await safeReply(interaction, { embeds: [embed], ephemeral: true });
    }
  },
};
