import {
  ChannelType,
  EmbedBuilder,
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
  type CategoryChannel,
} from 'discord.js';

import {
  DEFAULT_CATEGORY_NAME,
  DEFAULT_GENERATOR_CHANNEL_NAME,
} from '../config/constants';
import { SetupServiceError, runSetup } from '../services/setupService';
import type { AppCommand, TempChannelPermissionSource } from '../types';
import { applyBotAvatarEmbedColor } from '../utils/embedColor';
import { safeReply } from '../utils/safeReply';

const PERMISSION_SOURCE_LABELS: Record<TempChannelPermissionSource, string> = {
  category: 'Права категории',
  generator: 'Права канала Join to Create',
};

export const setupCommand: AppCommand = {
  data: new SlashCommandBuilder()
    .setName('setup')
    .setDescription('Подготовить сервер для временных голосовых комнат Pemucik.')
    .addBooleanOption((option) =>
      option
        .setName('editable')
        .setDescription(
          'Разрешить владельцу комнаты редактировать её через Discord-права.',
        )
        .setRequired(true),
    )
    .addChannelOption((option) =>
      option
        .setName('category')
        .setDescription(
          'Категория, в которой будут создаваться временные каналы.',
        )
        .addChannelTypes(ChannelType.GuildCategory)
        .setRequired(false),
    )
    .addStringOption((option) =>
      option
        .setName('permission')
        .setDescription('Откуда копировать права для новых временных каналов.')
        .addChoices(
          { name: 'Права категории', value: 'category' },
          { name: 'Права Join to Create', value: 'generator' },
        )
        .setRequired(false),
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
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

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    try {
      const editableByOwner = interaction.options.getBoolean('editable', true);
      const categoryOption = interaction.options.getChannel('category');
      const permissionSource = interaction.options.getString('permission');
      const category =
        categoryOption?.type === ChannelType.GuildCategory
          ? (categoryOption as CategoryChannel)
          : null;
      const normalizedPermissionSource =
        permissionSource === 'generator'
          ? 'generator'
          : permissionSource === 'category'
            ? 'category'
            : undefined;

      const result = await runSetup(interaction.guild, {
        editableByOwner,
        category,
        ...(normalizedPermissionSource
          ? { permissionSource: normalizedPermissionSource }
          : {}),
      });

      context.logger.info({
        event: 'setup_completed',
        guildId: interaction.guild.id,
        categoryId: result.settings.categoryId,
        generatorChannelId: result.settings.generatorChannelId,
        editableByOwner: result.settings.editableByOwner,
        permissionSource: result.settings.permissionSource,
      });

      const embed = await applyBotAvatarEmbedColor(
        new EmbedBuilder()
          .setTitle('Pemucik готов к работе')
          .setDescription(
            'Участники теперь могут заходить в канал-генератор и автоматически получать свою временную голосовую комнату.',
          )
          .addFields(
            {
              name: 'Категория',
              value: `<#${result.settings.categoryId}>`,
              inline: true,
            },
            {
              name: 'Генератор',
              value: `<#${result.settings.generatorChannelId}>`,
              inline: true,
            },
            {
              name: 'Создано сейчас',
              value: [
                result.categoryCreated
                  ? DEFAULT_CATEGORY_NAME
                  : 'Переиспользована существующая категория',
                result.generatorCreated
                  ? DEFAULT_GENERATOR_CHANNEL_NAME
                  : 'Переиспользован существующий канал-генератор',
              ].join('\n'),
            },
            {
              name: 'Новые настройки',
              value: [
                `Editable: ${result.settings.editableByOwner ? 'Да' : 'Нет'}`,
                `Permission: ${PERMISSION_SOURCE_LABELS[result.settings.permissionSource]}`,
              ].join('\n'),
            },
          ),
        interaction.client,
      );

      await safeReply(interaction, { embeds: [embed] }, context.logger);
    } catch (error) {
      if (error instanceof SetupServiceError) {
        context.logger.warn({
          event: 'setup_failed_expected',
          guildId: interaction.guild.id,
          code: error.code,
          message: error.message,
        });

        await safeReply(
          interaction,
          {
            content: error.message,
          },
          context.logger,
        );
        return;
      }

      context.logger.error(
        {
          event: 'setup_failed_unexpected',
          guildId: interaction.guild.id,
        },
        error,
      );

      throw error;
    }
  },
};
