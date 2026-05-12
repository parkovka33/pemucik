import {
  ChannelType,
  PermissionFlagsBits,
  type OverwriteResolvable,
  type CategoryChannel,
  type GuildMember,
  type VoiceChannel,
} from 'discord.js';

import { DEFAULT_NAME_TEMPLATE } from '../config/constants';
import type { GuildSettings } from '../types';

export class TempChannelServiceError extends Error {
  public constructor(
    public readonly code: 'CATEGORY_NOT_FOUND' | 'CATEGORY_INVALID',
    message: string,
  ) {
    super(message);
    this.name = 'TempChannelServiceError';
  }
}

function buildEditableOwnerOverwrite(member: GuildMember): OverwriteResolvable {
  return {
    id: member.id,
    allow: [PermissionFlagsBits.ManageChannels],
  };
}

function cloneGeneratorPermissionOverwrites(generatorChannel: GuildMember['voice']['channel']): OverwriteResolvable[] {
  if (!generatorChannel || !('permissionOverwrites' in generatorChannel)) {
    return [];
  }

  return generatorChannel.permissionOverwrites.cache.map((overwrite) => ({
    id: overwrite.id,
    allow: overwrite.allow.bitfield,
    deny: overwrite.deny.bitfield,
    type: overwrite.type,
  }));
}

function buildChannelName(member: GuildMember, settings: GuildSettings): string {
  const template = settings.defaultNameTemplate.trim() || DEFAULT_NAME_TEMPLATE;
  const displayName = member.displayName.trim() || member.user.username;
  const name = template.replaceAll('{user}', displayName).replace(/\s+/g, ' ').trim();
  const fallbackName = DEFAULT_NAME_TEMPLATE.replaceAll('{user}', displayName).replace(/\s+/g, ' ').trim();

  return name.slice(0, 100) || fallbackName.slice(0, 100);
}

async function getCategoryChannel(settings: GuildSettings, member: GuildMember): Promise<CategoryChannel> {
  const category = await member.guild.channels.fetch(settings.categoryId);

  if (!category) {
    throw new TempChannelServiceError(
      'CATEGORY_NOT_FOUND',
      'Не удалось найти настроенную категорию Noi. Запустите `/setup` ещё раз.',
    );
  }

  if (category.type !== ChannelType.GuildCategory) {
    throw new TempChannelServiceError(
      'CATEGORY_INVALID',
      'Настроенная категория Noi больше не является корректной. Запустите `/setup` ещё раз.',
    );
  }

  return category;
}

export async function createTempChannelForMember(
  member: GuildMember,
  settings: GuildSettings,
): Promise<VoiceChannel> {
  const category = await getCategoryChannel(settings, member);
  const permissionOverwrites = settings.permissionSource === 'generator'
    ? cloneGeneratorPermissionOverwrites(member.voice.channel)
    : [];

  if (settings.editableByOwner) {
    permissionOverwrites.push(buildEditableOwnerOverwrite(member));
  }

  const channelOptions: {
    name: string;
    type: ChannelType.GuildVoice;
    parent: string;
    userLimit: number;
    reason: string;
    permissionOverwrites?: OverwriteResolvable[];
  } = {
    name: buildChannelName(member, settings),
    type: ChannelType.GuildVoice,
    parent: category.id,
    userLimit: settings.defaultUserLimit,
    reason: `Временная комната Noi для ${member.user.tag}`,
  };

  if (permissionOverwrites.length > 0) {
    channelOptions.permissionOverwrites = permissionOverwrites;
  }

  if (settings.defaultBitrate > 0) {
    return member.guild.channels.create({
      ...channelOptions,
      bitrate: settings.defaultBitrate,
    });
  }

  return member.guild.channels.create(channelOptions);
}

export async function moveMemberToChannel(
  member: GuildMember,
  channel: VoiceChannel,
): Promise<void> {
  await member.voice.setChannel(channel);
}
