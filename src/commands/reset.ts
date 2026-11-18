import {
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
} from 'discord.js';

import {
  findGuildSettingsByGuildId,
  updateGuildDefaultBitrate,
} from '../db/repositories/guildSettingsRepo';
import type { AppCommand } from '../types';
import { safeReply } from '../utils/safeReply';

export const resetCommand: AppCommand = {
  data: new SlashCommandBuilder()
    .setName('reset')
    .setDescription(
      'Сбросить выбранные настройки Pemucik до безопасных значений по умолчанию.',
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand((subcommand) =>
      subcommand
        .setName('bitrate')
        .setDescription('Сбросить стандартный битрейт новых временных комнат.'),
    ),
  async execute(interaction, context) {
    if (!interaction.inGuild() || !interaction.guild) {
      await safeReply(
        interaction,
        {
          content: 'Эту команду можно использовать только внутри сервера.',
          flags: MessageFlags.Ephemeral,
        },
        context.logger,
      );
      return;
    }

    if (
      !interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)
    ) {
      await safeReply(
        interaction,
        {
          content: 'Эта команда доступна только администраторам сервера.',
          flags: MessageFlags.Ephemeral,
        },
        context.logger,
      );
      return;
    }

    const settings = findGuildSettingsByGuildId(interaction.guild.id);

    if (!settings) {
      await safeReply(
        interaction,
        {
          content: 'Сначала запустите `/setup`, а затем используйте `/reset`.',
          flags: MessageFlags.Ephemeral,
        },
        context.logger,
      );
      return;
    }

    updateGuildDefaultBitrate(interaction.guild.id, 0);

    context.logger.info({
      event: 'reset_bitrate_used',
      guildId: interaction.guild.id,
      userId: interaction.user.id,
    });

    await safeReply(
      interaction,
      {
        content:
          'Стандартный битрейт новых временных комнат сброшен. Теперь Pemucik снова будет использовать стандарт Discord для новых комнат.',
        flags: MessageFlags.Ephemeral,
      },
      context.logger,
    );
  },
};
