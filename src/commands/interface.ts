import { PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';

import { ensurePersistentInterface, InterfaceServiceError } from '../services/interfaceService';
import type { AppCommand } from '../types';
import { safeReply } from '../utils/safeReply';

export const interfaceCommand: AppCommand = {
  data: new SlashCommandBuilder()
    .setName('interface')
    .setDescription('Создать или обновить постоянный канал-интерфейс Pemucik.')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
  async execute(interaction, context) {
    if (!interaction.inGuild() || !interaction.guild) {
      await safeReply(interaction, {
        content: 'Эту команду можно использовать только внутри сервера.',
        ephemeral: true,
      });
      return;
    }

    if (!interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
      await safeReply(interaction, {
        content: 'Эта команда доступна только администраторам сервера.',
        ephemeral: true,
      });
      return;
    }

    try {
      const result = await ensurePersistentInterface(interaction.guild);

      context.logger.info({
        event: 'interface_command_used',
        guildId: interaction.guild.id,
        userId: interaction.user.id,
        channelId: result.channelId,
        messageId: result.messageId,
      });

      await safeReply(interaction, {
        content: `Pemucik Interface готов и закреплён в канале <#${result.channelId}>.`,
        ephemeral: true,
      });
    } catch (error) {
      if (error instanceof InterfaceServiceError) {
        context.logger.warn({
          event: 'interface_command_blocked',
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
        event: 'interface_command_failed',
        guildId: interaction.guild.id,
        userId: interaction.user.id,
      }, error);

      throw error;
    }
  },
};
