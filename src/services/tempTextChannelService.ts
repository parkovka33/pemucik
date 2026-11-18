import {
  ChannelType,
  PermissionFlagsBits,
  type Guild,
  type OverwriteResolvable,
  type TextChannel,
  type VoiceChannel,
} from 'discord.js';

import {
  deleteTempTextChannelByVoiceChannelId,
  findTempTextChannelByVoiceChannelId,
  upsertTempTextChannel,
} from '../db/repositories/tempTextChannelsRepo';
import { findTempChannelByChannelId } from '../db/repositories/tempChannelsRepo';
import type { ResolvedPanelTarget } from './panelService';

const LINKED_TEXT_PERMISSION_ALLOW = {
  ViewChannel: true,
  SendMessages: true,
  ReadMessageHistory: true,
} as const;

const LINKED_TEXT_PERMISSION_CLEAR = {
  ViewChannel: null,
  SendMessages: null,
  ReadMessageHistory: null,
} as const;

export class TempTextChannelServiceError extends Error {
  public constructor(
    public readonly code:
      | 'TEXT_CHANNEL_PARENT_REQUIRED'
      | 'TEXT_CHANNEL_INVALID'
      | 'VOICE_CHANNEL_INVALID',
    message: string,
  ) {
    super(message);
    this.name = 'TempTextChannelServiceError';
  }
}

function isUnknownChannelError(error: unknown): error is { code: number } {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 10003;
}

function buildLinkedTextChannelName(voiceChannel: VoiceChannel): string {
  const slug = voiceChannel.name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 90);

  return `chat-${slug || 'room'}`.slice(0, 100);
}

function buildLinkedTextTopic(voiceChannel: VoiceChannel): string {
  return `Временный текстовый канал Pemucik для голосовой комнаты ${voiceChannel.name} (${voiceChannel.id}).`;
}

function getAdminRoleIds(channel: VoiceChannel): string[] {
  const everyoneRoleId = channel.guild.roles.everyone.id;

  return channel.guild.roles.cache
    .filter((role) =>
      role.id !== everyoneRoleId && (
        role.permissions.has(PermissionFlagsBits.Administrator)
        || role.permissions.has(PermissionFlagsBits.ManageChannels)
      ),
    )
    .map((role) => role.id);
}

function buildInitialLinkedTextOverwrites(target: ResolvedPanelTarget): OverwriteResolvable[] {
  const everyoneRoleId = target.channel.guild.roles.everyone.id;
  const botId = target.channel.guild.members.me?.id;
  const allowedMemberIds = new Set<string>([
    target.record.ownerUserId,
    ...target.channel.members.map((member) => member.id),
  ]);

  if (botId) {
    allowedMemberIds.add(botId);
  }

  const overwrites: OverwriteResolvable[] = [
    {
      id: everyoneRoleId,
      deny: [PermissionFlagsBits.ViewChannel],
    },
  ];

  for (const memberId of allowedMemberIds) {
    overwrites.push({
      id: memberId,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ReadMessageHistory,
      ],
    });
  }

  for (const roleId of getAdminRoleIds(target.channel)) {
    overwrites.push({
      id: roleId,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ReadMessageHistory,
      ],
    });
  }

  return overwrites;
}

async function fetchTrackedVoiceChannel(guild: Guild, voiceChannelId: string): Promise<VoiceChannel | null> {
  let channel = null;

  try {
    channel = await guild.channels.fetch(voiceChannelId);
  } catch (error) {
    if (isUnknownChannelError(error)) {
      return null;
    }

    throw error;
  }

  if (!channel) {
    return null;
  }

  if (channel.type !== ChannelType.GuildVoice) {
    throw new TempTextChannelServiceError(
      'VOICE_CHANNEL_INVALID',
      'Связанная временная голосовая комната больше не является голосовым каналом.',
    );
  }

  return channel as VoiceChannel;
}

async function fetchTrackedTextChannel(guild: Guild, textChannelId: string): Promise<TextChannel | null> {
  let channel = null;

  try {
    channel = await guild.channels.fetch(textChannelId);
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
    throw new TempTextChannelServiceError(
      'TEXT_CHANNEL_INVALID',
      'Связанный временный текстовый канал больше не является текстовым каналом.',
    );
  }

  return channel as TextChannel;
}

async function syncLinkedTextChannelState(
  textChannel: TextChannel,
  voiceChannel: VoiceChannel,
  ownerUserId: string,
): Promise<void> {
  const desiredName = buildLinkedTextChannelName(voiceChannel);
  const desiredTopic = buildLinkedTextTopic(voiceChannel);
  const desiredParentId = voiceChannel.parentId ?? null;

  if (
    textChannel.name !== desiredName
    || textChannel.topic !== desiredTopic
    || textChannel.parentId !== desiredParentId
  ) {
    await textChannel.edit({
      name: desiredName,
      topic: desiredTopic,
      ...(desiredParentId ? { parent: desiredParentId } : {}),
      reason: `Pemucik: синхронизация связанного текстового канала для комнаты ${voiceChannel.id}`,
    });
  }

  const everyoneRoleId = voiceChannel.guild.roles.everyone.id;
  const botId = voiceChannel.guild.members.me?.id;
  const adminRoleIds = new Set(getAdminRoleIds(voiceChannel));
  const allowedMemberIds = new Set<string>([
    ownerUserId,
    ...voiceChannel.members.map((member) => member.id),
  ]);

  if (botId) {
    allowedMemberIds.add(botId);
  }

  await textChannel.permissionOverwrites.edit(everyoneRoleId, {
    ViewChannel: false,
  });

  for (const memberId of allowedMemberIds) {
    await textChannel.permissionOverwrites.edit(memberId, LINKED_TEXT_PERMISSION_ALLOW);
  }

  for (const roleId of adminRoleIds) {
    await textChannel.permissionOverwrites.edit(roleId, LINKED_TEXT_PERMISSION_ALLOW);
  }

  for (const overwrite of textChannel.permissionOverwrites.cache.values()) {
    if (overwrite.id === everyoneRoleId) {
      continue;
    }

    if (adminRoleIds.has(overwrite.id)) {
      continue;
    }

    if (voiceChannel.guild.roles.cache.has(overwrite.id)) {
      continue;
    }

    if (!allowedMemberIds.has(overwrite.id)) {
      await textChannel.permissionOverwrites.edit(overwrite.id, LINKED_TEXT_PERMISSION_CLEAR);
    }
  }
}

async function createLinkedTextChannel(target: ResolvedPanelTarget): Promise<TextChannel> {
  const parentId = target.channel.parentId ?? target.record.categoryId;

  if (!parentId) {
    throw new TempTextChannelServiceError(
      'TEXT_CHANNEL_PARENT_REQUIRED',
      'Для этой временной комнаты не удалось определить категорию для связанного текстового канала.',
    );
  }

  return target.channel.guild.channels.create({
    name: buildLinkedTextChannelName(target.channel),
    type: ChannelType.GuildText,
    parent: parentId,
    topic: buildLinkedTextTopic(target.channel),
    permissionOverwrites: buildInitialLinkedTextOverwrites(target),
    reason: `Pemucik: создание связанного текстового канала для комнаты ${target.channel.id}`,
  });
}

export async function ensureLinkedTempTextChannel(target: ResolvedPanelTarget): Promise<TextChannel> {
  const existingRecord = findTempTextChannelByVoiceChannelId(target.channel.id);

  if (existingRecord) {
    const existingChannel = await fetchTrackedTextChannel(target.channel.guild, existingRecord.textChannelId);

    if (existingChannel) {
      await syncLinkedTextChannelState(existingChannel, target.channel, target.record.ownerUserId);
      return existingChannel;
    }

    deleteTempTextChannelByVoiceChannelId(target.channel.id);
  }

  const createdChannel = await createLinkedTextChannel(target);
  upsertTempTextChannel({
    textChannelId: createdChannel.id,
    voiceChannelId: target.channel.id,
    guildId: target.channel.guild.id,
  });

  await syncLinkedTextChannelState(createdChannel, target.channel, target.record.ownerUserId);
  return createdChannel;
}

export async function syncLinkedTempTextChannelForVoiceChannel(
  guild: Guild,
  voiceChannelId: string,
): Promise<'not_linked' | 'missing_text_channel' | 'missing_voice_channel' | 'synced'> {
  const linkedRecord = findTempTextChannelByVoiceChannelId(voiceChannelId);

  if (!linkedRecord) {
    return 'not_linked';
  }

  const voiceChannel = await fetchTrackedVoiceChannel(guild, voiceChannelId);

  if (!voiceChannel) {
    return 'missing_voice_channel';
  }

  const textChannel = await fetchTrackedTextChannel(guild, linkedRecord.textChannelId);

  if (!textChannel) {
    deleteTempTextChannelByVoiceChannelId(voiceChannelId);
    return 'missing_text_channel';
  }

  const trackedVoiceRecord = findTempChannelByChannelId(voiceChannelId);

  if (!trackedVoiceRecord) {
    return 'missing_voice_channel';
  }

  await syncLinkedTextChannelState(textChannel, voiceChannel, trackedVoiceRecord.ownerUserId);

  return 'synced';
}

export async function syncLinkedTempTextChannelForTarget(target: ResolvedPanelTarget): Promise<void> {
  const linkedRecord = findTempTextChannelByVoiceChannelId(target.channel.id);

  if (!linkedRecord) {
    return;
  }

  const textChannel = await fetchTrackedTextChannel(target.channel.guild, linkedRecord.textChannelId);

  if (!textChannel) {
    deleteTempTextChannelByVoiceChannelId(target.channel.id);
    return;
  }

  await syncLinkedTextChannelState(textChannel, target.channel, target.record.ownerUserId);
}

export async function deleteLinkedTempTextChannelForVoiceChannel(
  guild: Guild,
  voiceChannelId: string,
): Promise<'not_linked' | 'missing_text_channel' | 'deleted'> {
  const linkedRecord = findTempTextChannelByVoiceChannelId(voiceChannelId);

  if (!linkedRecord) {
    return 'not_linked';
  }

  const textChannel = await fetchTrackedTextChannel(guild, linkedRecord.textChannelId);

  if (!textChannel) {
    deleteTempTextChannelByVoiceChannelId(voiceChannelId);
    return 'missing_text_channel';
  }

  try {
    await textChannel.delete(`Pemucik: удаление связанного текстового канала для комнаты ${voiceChannelId}`);
  } catch (error) {
    if (!isUnknownChannelError(error)) {
      throw error;
    }

    deleteTempTextChannelByVoiceChannelId(voiceChannelId);
    return 'missing_text_channel';
  }

  deleteTempTextChannelByVoiceChannelId(voiceChannelId);

  return 'deleted';
}
