import {
  ChannelType,
  EmbedBuilder,
  PermissionFlagsBits,
  type Guild,
  type GuildTextBasedChannel,
  type Message,
  type TextChannel,
} from 'discord.js';

import {
  DEFAULT_INTERFACE_CHANNEL_NAME,
  INTERFACE_MESSAGE_TITLE,
} from '../config/constants';
import {
  findGuildSettingsByGuildId,
  updateGuildInterfaceMetadata,
} from '../db/repositories/guildSettingsRepo';
import {
  buildPersistentInterfaceComponents,
  buildPersistentInterfaceEmbed,
} from './interfacePanelService';

export class InterfaceServiceError extends Error {
  public constructor(
    public readonly code:
      | 'SETTINGS_NOT_FOUND'
      | 'CATEGORY_NOT_FOUND'
      | 'INTERFACE_CHANNEL_INVALID',
    message: string,
  ) {
    super(message);
    this.name = 'InterfaceServiceError';
  }
}

function isUnknownChannelError(error: unknown): error is { code: number } {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 10003;
}

async function buildInterfaceEmbed(guild: Guild): Promise<EmbedBuilder> {
  return buildPersistentInterfaceEmbed(guild);
}

function findExistingInterfaceChannelByName(guild: Guild, categoryId: string): TextChannel | null {
  const existingChannel = guild.channels.cache.find(
    (channel): channel is TextChannel =>
      channel.type === ChannelType.GuildText
      && channel.parentId === categoryId
      && channel.name === DEFAULT_INTERFACE_CHANNEL_NAME,
  );

  return existingChannel ?? null;
}

async function fetchExistingInterfaceChannel(guild: Guild, channelId: string | null): Promise<TextChannel | null> {
  if (!channelId) {
    return null;
  }

  let channel = null;

  try {
    channel = await guild.channels.fetch(channelId);
  } catch (error) {
    if (isUnknownChannelError(error)) {
      return null;
    }

    throw error;
  }

  if (!channel) {
    return null;
  }

  if (channel.type !== ChannelType.GuildText) {
    throw new InterfaceServiceError(
      'INTERFACE_CHANNEL_INVALID',
      'Сохранённый интерфейс Noi больше не является текстовым каналом.',
    );
  }

  return channel as TextChannel;
}

async function ensureInterfaceChannel(guild: Guild): Promise<TextChannel> {
  const settings = findGuildSettingsByGuildId(guild.id);

  if (!settings) {
    throw new InterfaceServiceError(
      'SETTINGS_NOT_FOUND',
      'Сначала запустите `/setup`, чтобы Noi знал, где размещать интерфейс.',
    );
  }

  const existingChannel = await fetchExistingInterfaceChannel(guild, settings.interfaceChannelId);

  if (existingChannel) {
    return existingChannel;
  }

  let category = null;

  try {
    category = await guild.channels.fetch(settings.categoryId);
  } catch (error) {
    if (!isUnknownChannelError(error)) {
      throw error;
    }
  }

  if (!category || category.type !== ChannelType.GuildCategory) {
    throw new InterfaceServiceError(
      'CATEGORY_NOT_FOUND',
      'Не удалось найти категорию Noi. Запустите `/setup` ещё раз.',
    );
  }

  const namedChannel = findExistingInterfaceChannelByName(guild, category.id);

  if (namedChannel) {
    return namedChannel;
  }

  return guild.channels.create({
    name: DEFAULT_INTERFACE_CHANNEL_NAME,
    type: ChannelType.GuildText,
    parent: category.id,
    permissionOverwrites: [
      {
        id: guild.roles.everyone.id,
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.ReadMessageHistory,
          PermissionFlagsBits.SendMessages,
          PermissionFlagsBits.UseApplicationCommands,
        ],
      },
    ],
    reason: 'Noi: создание постоянного интерфейсного канала',
  });
}

function isPersistentInterfaceMessage(message: Message, botUserId: string | null): boolean {
  return message.author.id === botUserId
    && message.embeds[0]?.title === INTERFACE_MESSAGE_TITLE;
}

async function findExistingInterfaceMessage(channel: GuildTextBasedChannel): Promise<Message | null> {
  const botUserId = channel.client.user?.id ?? null;
  const recentMessages = await channel.messages.fetch({ limit: 20 });

  const existingMessage = recentMessages.find((message) =>
    isPersistentInterfaceMessage(message, botUserId),
  );

  return existingMessage ?? null;
}

async function upsertInterfaceMessage(
  channel: GuildTextBasedChannel,
  messageId: string | null,
): Promise<string> {
  if (messageId) {
    try {
      const existingMessage = await channel.messages.fetch(messageId);
      const embed = await buildInterfaceEmbed(channel.guild);
      await existingMessage.edit({
        embeds: [embed],
        components: buildPersistentInterfaceComponents(),
      });

      return existingMessage.id;
    } catch {
      // Message was deleted or became unavailable; send a fresh one below.
    }
  }

  const discoveredMessage = await findExistingInterfaceMessage(channel);

  if (discoveredMessage) {
    const embed = await buildInterfaceEmbed(channel.guild);
    await discoveredMessage.edit({
      embeds: [embed],
      components: buildPersistentInterfaceComponents(),
    });

    return discoveredMessage.id;
  }

  const embed = await buildInterfaceEmbed(channel.guild);
  const message = await channel.send({
    embeds: [embed],
    components: buildPersistentInterfaceComponents(),
  });

  return message.id;
}

export async function ensurePersistentInterface(guild: Guild): Promise<{ channelId: string; messageId: string }> {
  const settings = findGuildSettingsByGuildId(guild.id);

  if (!settings) {
    throw new InterfaceServiceError(
      'SETTINGS_NOT_FOUND',
      'Сначала запустите `/setup`, а потом создавайте интерфейс.',
    );
  }

  const channel = await ensureInterfaceChannel(guild);
  const messageId = await upsertInterfaceMessage(channel, settings.interfaceMessageId);
  const updatedSettings = updateGuildInterfaceMetadata(guild.id, channel.id, messageId);

  return {
    channelId: updatedSettings.interfaceChannelId ?? channel.id,
    messageId: updatedSettings.interfaceMessageId ?? messageId,
  };
}
