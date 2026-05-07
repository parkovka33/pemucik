import { PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';

import {
  findGuildSettingsByGuildId,
  updateGuildDefaultBitrate,
} from '../db/repositories/guildSettingsRepo';
import { resolveVoiceBitrateBits, VoiceControlServiceError } from '../services/voiceControlService';
import type { AppCommand } from '../types';
import { safeReply } from '../utils/safeReply';
import { getAvailableBitrateChoices, respondWithBitrateAutocomplete } from './voice';

export const setCommand: AppCommand = {
  data: new SlashCommandBuilder()
    .setName('set')
    .setDescription('Административные настройки XenoVoice.')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand((subcommand) =>
      subcommand
        .setName('bitrate')
        .setDescription('Задать битрейт по умолчанию для новых временных комнат.')
        .addIntegerOption((option) =>
          option
            .setName('value')
            .setDescription('Битрейт в kbps для новых комнат; можно выбрать подсказку или ввести своё значение')
            .setRequired(true)
            .setAutocomplete(true),
        ),
    ),
  async autocomplete(interaction) {
    const focused = interaction.options.getFocused(true);

    if (focused.name !== 'value') {
      await interaction.respond([]);
      return;
    }

    const focusedValue = typeof focused.value === 'number' ? focused.value : null;
    await respondWithBitrateAutocomplete(
      interaction,
      getAvailableBitrateChoices(interaction.guild, focusedValue),
    );
  },
  async execute(interaction, context) {
    if (!interaction.inGuild() || !interaction.guild) {
      await safeReply(interaction, {
        content: 'Эту команду можно использовать только внутри сервера.',
        ephemeral: true,
      });
      return;
    }

    try {
      const settings = findGuildSettingsByGuildId(interaction.guild.id);

      if (!settings) {
        await safeReply(interaction, {
          content: 'Сначала запустите `/setup`, а затем меняйте настройки по умолчанию.',
          ephemeral: true,
        });
        return;
      }

      const value = interaction.options.getInteger('value', true);
      const bitrateBits = resolveVoiceBitrateBits(interaction.guild, value);
      updateGuildDefaultBitrate(interaction.guild.id, bitrateBits);

      context.logger.info({
        event: 'set_bitrate_used',
        guildId: interaction.guild.id,
        userId: interaction.user.id,
        bitrateKbps: value,
      });

      await safeReply(interaction, {
        content: `Новые временные комнаты будут создаваться с битрейтом ${value} kbps. Уже существующие комнаты не изменяются.`,
        ephemeral: true,
      });
    } catch (error) {
      if (error instanceof VoiceControlServiceError) {
        context.logger.warn({
          event: 'set_bitrate_blocked',
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
        event: 'set_bitrate_failed',
        guildId: interaction.guild.id,
        userId: interaction.user.id,
      }, error);

      throw error;
    }
  },
};
