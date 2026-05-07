import { SlashCommandBuilder } from 'discord.js';

import { TEMP_CHANNEL_ALLOWED_USER_LIMITS } from '../config/constants';
import { buildPanelComponents, buildPanelEmbed, PanelServiceError, resolvePanelTarget, setPanelChannelUserLimit } from '../services/panelService';
import type { AppCommand } from '../types';
import { safeReply } from '../utils/safeReply';

export const limitCommand: AppCommand = {
  data: new SlashCommandBuilder()
    .setName('limit')
    .setDescription('Изменить лимит участников во временной голосовой комнате.')
    .addIntegerOption((option) =>
      option
        .setName('value')
        .setDescription('Новый лимит участников')
        .setRequired(true)
        .addChoices(
          ...TEMP_CHANNEL_ALLOWED_USER_LIMITS.map((limit) => ({
            name: limit === 0 ? 'Без лимита' : `${limit}`,
            value: limit,
          })),
        ),
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
      const limit = interaction.options.getInteger('value', true);
      const updatedTarget = await setPanelChannelUserLimit(target, limit, member);

      context.logger.info({
        event: 'limit_command_used',
        guildId: interaction.guild.id,
        userId: interaction.user.id,
        channelId: updatedTarget.channel.id,
        userLimit: limit,
      });

      await safeReply(interaction, {
        embeds: [buildPanelEmbed(updatedTarget)],
        components: buildPanelComponents(updatedTarget),
        ephemeral: true,
      });
    } catch (error) {
      if (error instanceof PanelServiceError) {
        context.logger.warn({
          event: 'limit_command_blocked',
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
        event: 'limit_command_failed',
        guildId: interaction.guild.id,
        userId: interaction.user.id,
      }, error);

      throw error;
    }
  },
};
