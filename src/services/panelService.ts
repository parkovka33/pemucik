import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  EmbedBuilder,
  ModalBuilder,
  PermissionFlagsBits,
  StringSelectMenuBuilder,
  TextInputBuilder,
  TextInputStyle,
  type GuildMember,
  type VoiceChannel,
} from 'discord.js';

import { PANEL_CUSTOM_ID_PREFIX, PANEL_RENAME_INPUT_ID } from '../config/constants';
import {
  findTempChannelByChannelId,
  findTempChannelByOwner,
  updateTempChannelOwner,
  updateTempChannelLockState,
  updateTempChannelUserLimit,
} from '../db/repositories/tempChannelsRepo';
import { getRenameCooldownRemainingSeconds, startRenameCooldown } from './cooldownService';
import { syncLinkedTempTextChannelForTarget } from './tempTextChannelService';
import { applyBotAvatarEmbedColor } from '../utils/embedColor';

import type { TempChannelRecord } from '../types';

const PANEL_ACTIONS = ['rename', 'lock', 'unlock', 'setlimit', 'refresh', 'claim'] as const;

type PanelAction = (typeof PANEL_ACTIONS)[number];
type PanelAccessMode = 'owner' | 'admin' | 'claim';

export class PanelServiceError extends Error {
  public constructor(
    public readonly code:
      | 'MEMBER_NOT_IN_GUILD'
      | 'TEMP_CHANNEL_NOT_FOUND'
      | 'TEMP_CHANNEL_INVALID'
      | 'NOT_OWNER_OR_ADMIN'
      | 'INVALID_NAME'
      | 'RENAME_COOLDOWN_ACTIVE'
      | 'INVALID_LIMIT'
      | 'CLAIM_NOT_ALLOWED'
      | 'ALREADY_OWNER',
    message: string,
  ) {
    super(message);
    this.name = 'PanelServiceError';
  }
}

export interface ResolvedPanelTarget {
  record: TempChannelRecord;
  channel: VoiceChannel;
  accessMode: PanelAccessMode;
  actorCanManage: boolean;
  actorCanClaimOwnership: boolean;
}

function buildPanelCustomId(action: PanelAction, channelId: string): string {
  return `${PANEL_CUSTOM_ID_PREFIX}:${action}:${channelId}`;
}

function isAdminOverride(member: GuildMember): boolean {
  return member.permissions.has(PermissionFlagsBits.Administrator)
    || member.permissions.has(PermissionFlagsBits.ManageChannels);
}

function formatUserLimit(userLimit: number): string {
  return userLimit > 0 ? `${userLimit}` : 'Без лимита';
}

function formatBitrate(bitrate: number): string {
  return `${Math.floor(bitrate / 1_000)} kbps`;
}

function formatRegion(rtcRegion: string | null): string {
  return rtcRegion ?? 'Авто';
}

function isChannelGhosted(channel: VoiceChannel): boolean {
  const overwrite = channel.permissionOverwrites.cache.get(channel.guild.roles.everyone.id);

  return overwrite?.deny.has(PermissionFlagsBits.ViewChannel) ?? false;
}

function normalizeChannelName(rawName: string): string {
  return rawName.replace(/\s+/g, ' ').trim();
}

async function fetchTrackedVoiceChannel(member: GuildMember, channelId: string): Promise<VoiceChannel> {
  const channel = await member.guild.channels.fetch(channelId);

  if (!channel || channel.type !== ChannelType.GuildVoice) {
    throw new PanelServiceError(
      'TEMP_CHANNEL_INVALID',
      'Отслеживаемая временная комната больше не существует как голосовой канал.',
    );
  }

  return channel as VoiceChannel;
}

function isActorCurrentRoomOccupant(channel: VoiceChannel, member: GuildMember): boolean {
  return member.voice.channelId === channel.id && channel.members.has(member.id);
}

function canClaimOwnership(record: TempChannelRecord, channel: VoiceChannel, member: GuildMember): boolean {
  if (record.ownerUserId === member.id) {
    return false;
  }

  if (!isActorCurrentRoomOccupant(channel, member)) {
    return false;
  }

  return !channel.members.has(record.ownerUserId);
}

function resolveAccessMode(
  record: TempChannelRecord,
  channel: VoiceChannel,
  member: GuildMember,
): ResolvedPanelTarget['accessMode'] {
  if (record.ownerUserId === member.id) {
    return 'owner';
  }

  if (isAdminOverride(member)) {
    return 'admin';
  }

  if (canClaimOwnership(record, channel, member)) {
    return 'claim';
  }

  throw new PanelServiceError(
    'NOT_OWNER_OR_ADMIN',
    'Только владелец комнаты или администратор сервера может использовать эти элементы управления.',
  );
}

function buildResolvedTarget(
  record: TempChannelRecord,
  channel: VoiceChannel,
  member: GuildMember,
): ResolvedPanelTarget {
  const accessMode = resolveAccessMode(record, channel, member);

  return {
    record,
    channel,
    accessMode,
    actorCanManage: accessMode === 'owner' || accessMode === 'admin',
    actorCanClaimOwnership: canClaimOwnership(record, channel, member),
  };
}

function assertManageAccess(target: ResolvedPanelTarget): void {
  if (target.actorCanManage) {
    return;
  }

  throw new PanelServiceError(
    'NOT_OWNER_OR_ADMIN',
    'Только владелец комнаты или администратор сервера может использовать эти элементы управления.',
  );
}

async function ensurePermissionIfNeutral(
  channel: VoiceChannel,
  overwriteId: string,
  permission: 'Connect' | 'ViewChannel',
): Promise<void> {
  const overwrite = channel.permissionOverwrites.cache.get(overwriteId);
  const permissionBit = PermissionFlagsBits[permission];

  if (overwrite?.allow.has(permissionBit) || overwrite?.deny.has(permissionBit)) {
    return;
  }

  await channel.permissionOverwrites.edit(overwriteId, {
    [permission]: true,
  });
}

export function isPanelCustomId(customId: string): boolean {
  return customId.startsWith(`${PANEL_CUSTOM_ID_PREFIX}:`);
}

export function parsePanelCustomId(customId: string): { action: PanelAction; channelId: string } | null {
  const parts = customId.split(':');

  if (parts.length !== 4 || `${parts[0]}:${parts[1]}` !== PANEL_CUSTOM_ID_PREFIX) {
    return null;
  }

  const action = parts[2] as PanelAction;
  const channelId = parts[3];

  if (!PANEL_ACTIONS.includes(action) || !channelId) {
    return null;
  }

  return {
    action,
    channelId,
  };
}

export async function resolvePanelTarget(member: GuildMember): Promise<ResolvedPanelTarget> {
  const activeChannelId = member.voice.channelId;

  if (activeChannelId) {
    const currentChannelRecord = findTempChannelByChannelId(activeChannelId);

    if (currentChannelRecord) {
      const channel = await fetchTrackedVoiceChannel(member, currentChannelRecord.channelId);
      return buildResolvedTarget(currentChannelRecord, channel, member);
    }
  }

  const ownedRoomRecord = findTempChannelByOwner(member.guild.id, member.id);

  if (!ownedRoomRecord) {
    throw new PanelServiceError(
      'TEMP_CHANNEL_NOT_FOUND',
      'У вас сейчас нет отслеживаемой временной голосовой комнаты.',
    );
  }

  const channel = await fetchTrackedVoiceChannel(member, ownedRoomRecord.channelId);
  return buildResolvedTarget(ownedRoomRecord, channel, member);
}

export async function resolvePanelTargetByChannelId(
  member: GuildMember,
  channelId: string,
): Promise<ResolvedPanelTarget> {
  const record = findTempChannelByChannelId(channelId);

  if (!record) {
    throw new PanelServiceError(
      'TEMP_CHANNEL_NOT_FOUND',
      'Эта комната не отслеживается как временная комната Noi.',
    );
  }

  const channel = await fetchTrackedVoiceChannel(member, channelId);
  return buildResolvedTarget(record, channel, member);
}

export async function buildPanelEmbed(target: ResolvedPanelTarget): Promise<EmbedBuilder> {
  const accessModeLabel = target.accessMode === 'admin'
    ? 'Доступ администратора'
    : target.accessMode === 'claim'
      ? 'Доступ на получение владения'
      : 'Доступ владельца';
  const description = target.actorCanManage
    ? 'Используйте элементы ниже, чтобы управлять своей временной голосовой комнатой.'
    : 'Владелец комнаты сейчас не находится внутри неё. Вы можете забрать владение и после этого управлять комнатой.';

  const embed = new EmbedBuilder()
    .setTitle('Панель управления Noi')
    .setDescription(description)
    .addFields(
      {
        name: 'Канал',
        value: `<#${target.channel.id}>`,
        inline: true,
      },
      {
        name: 'Владелец',
        value: `<@${target.record.ownerUserId}>`,
        inline: true,
      },
      {
        name: 'Статус',
        value: target.record.isLocked ? 'Закрыта' : 'Открыта',
        inline: true,
      },
      {
        name: 'Лимит участников',
        value: formatUserLimit(target.record.userLimit),
        inline: true,
      },
      {
        name: 'Видимость',
        value: isChannelGhosted(target.channel) ? 'Скрыта' : 'Видима',
        inline: true,
      },
      {
        name: 'Битрейт',
        value: formatBitrate(target.channel.bitrate),
        inline: true,
      },
      {
        name: 'Регион',
        value: formatRegion(target.channel.rtcRegion),
        inline: true,
      },
      {
        name: 'NSFW',
        value: target.channel.nsfw ? 'Включён' : 'Выключен',
        inline: true,
      },
      {
        name: 'Режим управления',
        value: accessModeLabel,
      },
    );

  return applyBotAvatarEmbedColor(embed, target.channel.client);
}

export function buildPanelComponents(
  target: ResolvedPanelTarget,
): Array<ActionRowBuilder<ButtonBuilder> | ActionRowBuilder<StringSelectMenuBuilder>> {
  const buttons = new ActionRowBuilder<ButtonBuilder>();

  if (target.actorCanManage) {
    buttons.addComponents(
      new ButtonBuilder()
        .setCustomId(buildPanelCustomId('rename', target.channel.id))
        .setLabel('Переименовать')
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId(buildPanelCustomId('lock', target.channel.id))
        .setLabel('Закрыть')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(target.record.isLocked),
      new ButtonBuilder()
        .setCustomId(buildPanelCustomId('unlock', target.channel.id))
        .setLabel('Открыть')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(!target.record.isLocked),
    );
  }

  if (target.actorCanClaimOwnership) {
    buttons.addComponents(
      new ButtonBuilder()
        .setCustomId(buildPanelCustomId('claim', target.channel.id))
        .setLabel('Забрать владение')
        .setStyle(ButtonStyle.Success),
    );
  }

  buttons.addComponents(
    new ButtonBuilder()
      .setCustomId(buildPanelCustomId('refresh', target.channel.id))
      .setLabel('Обновить')
      .setStyle(ButtonStyle.Secondary),
  );

  if (!target.actorCanManage) {
    return [buttons];
  }

  const limitSelect = new StringSelectMenuBuilder()
    .setCustomId(buildPanelCustomId('setlimit', target.channel.id))
    .setPlaceholder('Используйте /voice limit для смены лимита')
    .setDisabled(true)
    .addOptions({
      label: 'Лимит теперь меняется через /voice limit',
      value: 'disabled',
      default: true,
    });

  return [buttons, new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(limitSelect)];
}

export function buildRenameModal(channelId: string, currentName: string): ModalBuilder {
  const input = new TextInputBuilder()
    .setCustomId(PANEL_RENAME_INPUT_ID)
    .setLabel('Новое название комнаты')
    .setRequired(true)
    .setMinLength(1)
    .setMaxLength(50)
    .setStyle(TextInputStyle.Short)
    .setValue(currentName);

  return new ModalBuilder()
    .setCustomId(buildPanelCustomId('rename', channelId))
    .setTitle('Переименовать временную комнату')
    .addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(input));
}

export async function renamePanelChannel(
  target: ResolvedPanelTarget,
  actor: GuildMember,
  rawName: string,
): Promise<ResolvedPanelTarget> {
  assertManageAccess(target);

  const name = normalizeChannelName(rawName);

  if (!name || name.length > 50) {
    throw new PanelServiceError(
      'INVALID_NAME',
      'Название комнаты должно содержать от 1 до 50 читаемых символов.',
    );
  }

  const cooldownRemainingSeconds = getRenameCooldownRemainingSeconds(actor.guild.id, actor.id);

  if (cooldownRemainingSeconds > 0) {
    throw new PanelServiceError(
      'RENAME_COOLDOWN_ACTIVE',
      `Подождите ${cooldownRemainingSeconds} сек., прежде чем снова переименовывать комнату.`,
    );
  }

  startRenameCooldown(actor.guild.id, actor.id);
  await target.channel.edit({ name, reason: `Noi: переименование комнаты пользователем ${actor.user.tag}` });
  const updatedTarget = await resolvePanelTargetByChannelId(actor, target.channel.id);
  await syncLinkedTempTextChannelForTarget(updatedTarget);

  return updatedTarget;
}

export async function lockPanelChannel(target: ResolvedPanelTarget): Promise<ResolvedPanelTarget> {
  assertManageAccess(target);

  const everyoneRoleId = target.channel.guild.roles.everyone.id;
  const ownerId = target.record.ownerUserId;
  const botId = target.channel.guild.members.me?.id;

  await target.channel.permissionOverwrites.edit(everyoneRoleId, {
    Connect: false,
  });

  await ensurePermissionIfNeutral(target.channel, ownerId, 'Connect');

  if (botId) {
    await ensurePermissionIfNeutral(target.channel, botId, 'Connect');
  }

  const adminRoles = target.channel.guild.roles.cache.filter((role) =>
    role.id !== everyoneRoleId && (
      role.permissions.has(PermissionFlagsBits.Administrator)
      || role.permissions.has(PermissionFlagsBits.ManageChannels)
    ),
  );

  for (const role of adminRoles.values()) {
    await ensurePermissionIfNeutral(target.channel, role.id, 'Connect');
  }

  updateTempChannelLockState(target.channel.id, true);
  return {
    ...target,
    record: {
      ...target.record,
      isLocked: true,
    },
  };
}

export async function unlockPanelChannel(target: ResolvedPanelTarget): Promise<ResolvedPanelTarget> {
  assertManageAccess(target);

  await target.channel.permissionOverwrites.edit(target.channel.guild.roles.everyone.id, {
    Connect: null,
  });

  updateTempChannelLockState(target.channel.id, false);
  return {
    ...target,
    record: {
      ...target.record,
      isLocked: false,
    },
  };
}

export async function setPanelChannelUserLimit(
  target: ResolvedPanelTarget,
  limit: number,
  actor: GuildMember,
): Promise<ResolvedPanelTarget> {
  assertManageAccess(target);

  if (!Number.isInteger(limit) || limit < 0 || limit > 99) {
    throw new PanelServiceError(
      'INVALID_LIMIT',
      'Лимит участников должен быть целым числом от 0 до 99. Значение `0` отключает лимит.',
    );
  }

  await target.channel.edit({
    userLimit: limit,
    reason: `Noi: изменение лимита комнаты пользователем ${actor.user.tag}`,
  });

  updateTempChannelUserLimit(target.channel.id, limit);
  return resolvePanelTargetByChannelId(actor, target.channel.id);
}

export async function claimPanelChannel(
  target: ResolvedPanelTarget,
  actor: GuildMember,
): Promise<ResolvedPanelTarget> {
  const latestTarget = await resolvePanelTargetByChannelId(actor, target.channel.id);

  if (latestTarget.record.ownerUserId === actor.id) {
    throw new PanelServiceError(
      'ALREADY_OWNER',
      'Вы уже владеете этой временной комнатой.',
    );
  }

  if (!latestTarget.actorCanClaimOwnership) {
    throw new PanelServiceError(
      'CLAIM_NOT_ALLOWED',
      'Сейчас нельзя забрать владение этой комнатой. Владелец должен отсутствовать в комнате, а вы должны находиться внутри неё.',
    );
  }

  if (latestTarget.record.isLocked) {
    await ensurePermissionIfNeutral(latestTarget.channel, actor.id, 'Connect');
  }

  if (isChannelGhosted(latestTarget.channel)) {
    await ensurePermissionIfNeutral(latestTarget.channel, actor.id, 'ViewChannel');
  }

  updateTempChannelOwner(latestTarget.channel.id, actor.id);
  const updatedTarget = await resolvePanelTargetByChannelId(actor, latestTarget.channel.id);
  await syncLinkedTempTextChannelForTarget(updatedTarget);

  return updatedTarget;
}
