import { EmbedBuilder, SlashCommandBuilder } from 'discord.js';

import { APP_COLOR } from '../config/constants';
import { getEnv } from '../config/env';
import type { AppCommand } from '../types';
import { safeReply } from '../utils/safeReply';

export const supportCommand: AppCommand = {
  data: new SlashCommandBuilder()
    .setName('support')
    .setDescription('Показать ссылки на поддержку и донат.'),
  async execute(interaction) {
    const env = getEnv();

    const embed = new EmbedBuilder()
      .setColor(APP_COLOR)
      .setTitle('Поддержка XenoVoice')
      .setDescription('XenoVoice сейчас находится на стадии небольшой беты. Поддержка остаётся дружелюбной и лёгкой, без платного доступа к базовой помощи.')
      .addFields(
        {
          name: 'Где получить помощь',
          value: env.supportServerUrl
            ? `Присоединяйтесь к серверу поддержки: ${env.supportServerUrl}`
            : 'Ссылка на сервер поддержки пока не настроена. На данный момент попросите администратора бота собрать детали проблемы и контекст конфигурации перед обращением.',
        },
        {
          name: 'Перед тем как сообщить о проблеме',
          value: [
            'Отметьте, какая именно команда или какое действие в панели не сработало.',
            'Укажите, есть ли у бота права `Manage Channels` или `Administrator`.',
            'Если проблема связана с временной комнатой, добавьте название сервера и опишите, что вы ожидали увидеть.',
          ].join('\n'),
        },
        {
          name: 'Поддержать проект',
          value: env.donationUrl
            ? `Если XenoVoice помогает вашему серверу, поддержать разработку можно здесь: ${env.donationUrl}`
            : 'Ссылка на донат пока не настроена. Бот остаётся полностью полезным и без неё.',
        },
      );

    await safeReply(interaction, { embeds: [embed], ephemeral: true });
  },
};
