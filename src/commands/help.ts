import { EmbedBuilder, SlashCommandBuilder } from 'discord.js';

import type { AppCommand } from '../types';
import { applyBotAvatarEmbedColor } from '../utils/embedColor';
import { safeReply } from '../utils/safeReply';

export const helpCommand: AppCommand = {
  data: new SlashCommandBuilder()
    .setName('help')
    .setDescription('Показать инструкцию по настройке и использованию Pemucik.'),
  async execute(interaction) {
    const embed = await applyBotAvatarEmbedColor(new EmbedBuilder()
      .setTitle('Справка Pemucik')
      .setDescription('Pemucik делает временные голосовые комнаты простыми: администратор один раз запускает `/setup`, участники заходят в канал-генератор, а владельцы комнат управляют ими через `/voice ...` и административные slash-команды.')
      .addFields(
        {
          name: 'Для администраторов',
          value: [
            'Запустите `/setup` один раз, чтобы создать или переиспользовать категорию Pemucik и канал-генератор.',
            'Убедитесь, что бот может управлять каналами, перемещать участников и изменять переопределения прав доступа.',
            'Во время беты самый простой способ избежать проблем с `/setup` и управлением комнатами — выдать боту `Administrator`.',
          ].join('\n'),
        },
        {
          name: 'Для участников',
          value: [
            'Зайдите в голосовой канал-генератор Pemucik.',
            'Pemucik автоматически создаст временную комнату и перенесёт вас в неё.',
            'Когда все выйдут, временная комната удалится автоматически.',
          ].join('\n'),
        },
        {
          name: 'Для владельцев комнат',
          value: [
            'Внутри `/voice` доступны `name`, `lock`, `unlock`, `limit`, `claim`, `transfer`, `permit`, `reject`, `status`, `bitrate`, `ghost`, `unghost`, `nsfw`, `region` и `invite`.',
            'Встроенный чат голосовой комнаты можно использовать без отдельного текстового канала; TTS сейчас временно отключён.',
            'Администраторы сервера всё равно могут вмешаться, если у них есть `Manage Channels` или `Administrator`.',
          ].join('\n'),
        },
        {
          name: 'Если владелец пропал',
          value: [
            'Если владелец комнаты больше не находится внутри неё, участник в этой комнате может забрать владение через `/voice claim`.',
            'После этого новый владелец сможет использовать все обычные команды `/voice ...`.',
          ].join('\n'),
        },
        {
          name: 'Для администраторов дополнительно',
          value: [
            'Используйте `/set bitrate`, чтобы задать битрейт по умолчанию для новых временных комнат.',
            'Используйте `/reset bitrate`, чтобы снять этот override и вернуть стандарт Discord для новых комнат.',
          ].join('\n'),
        },
        {
          name: 'Частые проблемы',
          value: [
            'Если закрытие или открытие комнаты падает с `Missing Permissions`, значит боту всё ещё не хватает прав для изменения переопределений прав канала.',
            'Если вход в генератор ничего не делает, попросите администратора сначала запустить `/setup` и проверьте, что вы зашли именно в голосовой канал-генератор, а не в обычную комнату.',
            'Если нужна помощь или вы хотите сообщить о проблеме в бете, используйте `/support`.',
          ].join('\n'),
        },
      ), interaction.client);

    await safeReply(interaction, { embeds: [embed], ephemeral: true });
  },
};
