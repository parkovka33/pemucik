import { EmbedBuilder, SlashCommandBuilder } from 'discord.js';

import { DEFAULT_DONATION_URL } from '../config/constants';
import { getEnv } from '../config/env';
import type { AppCommand } from '../types';
import { applyBotAvatarEmbedColor } from '../utils/embedColor';
import { safeReply } from '../utils/safeReply';

export const supportCommand: AppCommand = {
  data: new SlashCommandBuilder()
    .setName('support')
    .setDescription('Показать ссылки на донатттттттттттт.'),
  async execute(interaction) {
    const env = getEnv();
    const donationUrl = env.donationUrl ?? DEFAULT_DONATION_URL;

    const embed = await applyBotAvatarEmbedColor(new EmbedBuilder()
      .setTitle('Поддержка Noi')
      .setDescription('Noi сейчас находится на стадии небольшой беты (наверное).')
      .addFields(
        {
          name: 'Поддержать проект',
          value: `Если этот говнобот Вам понравился, то поддержать разработку можно здесь: ${donationUrl}`,
        },
      ), interaction.client);

    await safeReply(interaction, { embeds: [embed], ephemeral: true });
  },
};
