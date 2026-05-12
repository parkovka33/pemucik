import {
  ChannelType,
  PermissionFlagsBits,
  type Guild,
  type GuildMember,
  type Role,
  type VoiceChannel,
} from 'discord.js';

import {
  COMMON_VOICE_REGION_IDS,
  MAX_TEMP_CHANNEL_BITRATE_KBPS,
  MIN_TEMP_CHANNEL_BITRATE_KBPS,
} from '../config/constants';
import {
  findTempChannelByOwner,
  findTempChannelByChannelId,
  updateTempChannelOwner,
} from '../db/repositories/tempChannelsRepo';
import {
  deleteTrackedTempChannelArtifacts,
} from './cleanupService';
import {
  resolvePanelTargetByChannelId,
  type ResolvedPanelTarget,
} from './panelService';
import { syncLinkedTempTextChannelForTarget } from './tempTextChannelService';

const COMMON_REGION_IDS_SET = new Set(COMMON_VOICE_REGION_IDS);
const SET_VOICE_CHANNEL_STATUS_PERMISSION = 1n << 48n;

type ManagedPermissionName = 'Connect' | 'ViewChannel';
type AccessTarget = GuildMember | Role;

export class VoiceControlServiceError extends Error {
  public constructor(
    public readonly code:
      | 'NOT_OWNER_OR_ADMIN'
      | 'INVALID_BITRATE'
      | 'INVALID_REGION'
      | 'INVALID_STATUS'
      | 'INVALID_ACCESS_TARGET'
      | 'REJECT_OWNER_NOT_ALLOWED'
      | 'REJECT_EVERYONE_NOT_ALLOWED'
      | 'REJECT_ADMIN_ROLE_NOT_ALLOWED'
      | 'VOICE_STATUS_PERMISSION_REQUIRED'
      | 'TRANSFER_TARGET_INVALID'
      | 'TRANSFER_TO_SELF'
      | 'REQUEST_SELF_NOT_ALLOWED'
      | 'REQUEST_TARGET_NOT_FOUND'
      | 'REQUEST_ALREADY_IN_ROOM'
      | 'REMOVE_PERMIT_TARGET_INVALID'
      | 'KICK_OWNER_NOT_ALLOWED'
      | 'KICK_TARGET_NOT_IN_ROOM',
    message: string,
  ) {
    super(message);
    this.name = 'VoiceControlServiceError';
  }
}

function assertManageAccess(target: ResolvedPanelTarget): void {
  if (target.actorCanManage) {
    return;
  }

  throw new VoiceControlServiceError(
    'NOT_OWNER_OR_ADMIN',
    'Только владелец комнаты или администратор сервера может использовать эту команду.',
  );
}

function getAdminRoles(channel: VoiceChannel): Role[] {
  const everyoneRoleId = channel.guild.roles.everyone.id;

  return channel.guild.roles.cache
    .filter((role) =>
      role.id !== everyoneRoleId && (
        role.permissions.has(PermissionFlagsBits.Administrator)
        || role.permissions.has(PermissionFlagsBits.ManageChannels)
      ),
    )
    .map((role) => role);
}

async function ensurePermissionIfNeutral(
  channel: VoiceChannel,
  overwriteId: string,
  permission: ManagedPermissionName,
): Promise<void> {
  const overwrite = channel.permissionOverwrites.cache.get(overwriteId);

  if (overwrite?.allow.has(PermissionFlagsBits[permission]) || overwrite?.deny.has(PermissionFlagsBits[permission])) {
    return;
  }

  await channel.permissionOverwrites.edit(overwriteId, {
    [permission]: true,
  });
}

async function clearManagedPermission(
  channel: VoiceChannel,
  overwriteId: string,
  permission: ManagedPermissionName,
  mode: 'allow' | 'deny',
): Promise<void> {
  const overwrite = channel.permissionOverwrites.cache.get(overwriteId);
  const bit = PermissionFlagsBits[permission];
  const shouldClear = mode === 'allow'
    ? overwrite?.allow.has(bit)
    : overwrite?.deny.has(bit);

  if (!shouldClear) {
    return;
  }

  await channel.permissionOverwrites.edit(overwriteId, {
    [permission]: null,
  });
}

function normalizeRegion(rawValue: string): string | null {
  const value = rawValue.trim().toLowerCase();

  if (!value) {
    throw new VoiceControlServiceError(
      'INVALID_REGION',
      'Укажите `auto` или стандартный идентификатор голосового региона, например `us-east`.',
    );
  }

  if (value === 'auto') {
    return null;
  }

  if (!/^[a-z-]+$/.test(value)) {
    throw new VoiceControlServiceError(
      'INVALID_REGION',
      'Регион должен состоять только из строчных букв и дефисов, например `rotterdam` или `us-west`.',
    );
  }

  return value;
}

function normalizeVoiceStatus(rawValue: string): string {
  const value = rawValue.trim();

  if (!value) {
    throw new VoiceControlServiceError(
      'INVALID_STATUS',
      'Статус комнаты не может быть пустым.',
    );
  }

  if (value.length > 500) {
    throw new VoiceControlServiceError(
      'INVALID_STATUS',
      'Статус комнаты не должен превышать 500 символов.',
    );
  }

  return value;
}

export function resolveVoiceBitrateBits(guild: Guild, bitrateKbps: number): number {
  if (!Number.isInteger(bitrateKbps)) {
    throw new VoiceControlServiceError(
      'INVALID_BITRATE',
      'Битрейт должен быть целым числом в kbps.',
    );
  }

  if (bitrateKbps < MIN_TEMP_CHANNEL_BITRATE_KBPS || bitrateKbps > MAX_TEMP_CHANNEL_BITRATE_KBPS) {
    throw new VoiceControlServiceError(
      'INVALID_BITRATE',
      `Укажите битрейт от ${MIN_TEMP_CHANNEL_BITRATE_KBPS} до ${MAX_TEMP_CHANNEL_BITRATE_KBPS} kbps.`,
    );
  }

  const bitrateBits = bitrateKbps * 1_000;

  if (bitrateBits > guild.maximumBitrate) {
    throw new VoiceControlServiceError(
      'INVALID_BITRATE',
      `Для этого сервера доступно не больше ${Math.floor(guild.maximumBitrate / 1_000)} kbps.`,
    );
  }

  return bitrateBits;
}

async function fetchTrackedTempVoiceChannel(guild: Guild, channelId: string): Promise<VoiceChannel> {
  const channel = await guild.channels.fetch(channelId);

  if (!channel || channel.type !== ChannelType.GuildVoice) {
    throw new VoiceControlServiceError(
      'REQUEST_TARGET_NOT_FOUND',
      'Не удалось найти отслеживаемую временную комнату для этого владельца.',
    );
  }

  return channel as VoiceChannel;
}

function describeTarget(target: AccessTarget): string {
  return 'user' in target ? target.user.tag : `роль ${target.name}`;
}

function assertBotCanSetVoiceStatus(channel: VoiceChannel): void {
  const botMember = channel.guild.members.me;

  if (!botMember) {
    throw new VoiceControlServiceError(
      'VOICE_STATUS_PERMISSION_REQUIRED',
      'Не удалось проверить права бота для обновления статуса голосовой комнаты.',
    );
  }

  const permissions = channel.permissionsFor(botMember);

  if (!permissions?.has(SET_VOICE_CHANNEL_STATUS_PERMISSION)) {
    throw new VoiceControlServiceError(
      'VOICE_STATUS_PERMISSION_REQUIRED',
      'Боту не хватает права `Set Voice Channel Status` для этой комнаты.',
    );
  }

  if (botMember.voice.channelId !== channel.id && !permissions.has(PermissionFlagsBits.ManageChannels)) {
    throw new VoiceControlServiceError(
      'VOICE_STATUS_PERMISSION_REQUIRED',
      'Чтобы менять статус комнаты вне голосового канала, боту также нужно право `Manage Channels`.',
    );
  }
}

export function isVoiceRoomGhosted(channel: VoiceChannel): boolean {
  const overwrite = channel.permissionOverwrites.cache.get(channel.guild.roles.everyone.id);

  return overwrite?.deny.has(PermissionFlagsBits.ViewChannel) ?? false;
}

export function formatVoiceBitrate(channel: VoiceChannel): string {
  return `${Math.floor(channel.bitrate / 1_000)} kbps`;
}

export function formatVoiceRegion(channel: VoiceChannel): string {
  if (!channel.rtcRegion) {
    return 'Авто';
  }

  return COMMON_REGION_IDS_SET.has(channel.rtcRegion as (typeof COMMON_VOICE_REGION_IDS)[number])
    ? channel.rtcRegion
    : `${channel.rtcRegion} (custom)`;
}

export async function setVoiceChannelBitrate(
  target: ResolvedPanelTarget,
  actor: GuildMember,
  bitrateKbps: number,
): Promise<ResolvedPanelTarget> {
  assertManageAccess(target);
  const bitrateBits = resolveVoiceBitrateBits(actor.guild, bitrateKbps);

  await target.channel.edit({
    bitrate: bitrateBits,
    reason: `Noi: изменение битрейта комнаты пользователем ${actor.user.tag}`,
  });

  return resolvePanelTargetByChannelId(actor, target.channel.id);
}

export async function ghostVoiceChannel(
  target: ResolvedPanelTarget,
  actor: GuildMember,
): Promise<ResolvedPanelTarget> {
  assertManageAccess(target);

  const everyoneRoleId = target.channel.guild.roles.everyone.id;
  const botId = target.channel.guild.members.me?.id;

  await target.channel.permissionOverwrites.edit(everyoneRoleId, {
    ViewChannel: false,
  });

  await ensurePermissionIfNeutral(target.channel, target.record.ownerUserId, 'ViewChannel');

  if (botId) {
    await ensurePermissionIfNeutral(target.channel, botId, 'ViewChannel');
  }

  for (const role of getAdminRoles(target.channel)) {
    await ensurePermissionIfNeutral(target.channel, role.id, 'ViewChannel');
  }

  return resolvePanelTargetByChannelId(actor, target.channel.id);
}

export async function unghostVoiceChannel(
  target: ResolvedPanelTarget,
  actor: GuildMember,
): Promise<ResolvedPanelTarget> {
  assertManageAccess(target);

  await target.channel.permissionOverwrites.edit(target.channel.guild.roles.everyone.id, {
    ViewChannel: null,
  });

  return resolvePanelTargetByChannelId(actor, target.channel.id);
}

export async function setVoiceChannelNsfw(
  target: ResolvedPanelTarget,
  actor: GuildMember,
  enabled: boolean,
): Promise<ResolvedPanelTarget> {
  assertManageAccess(target);

  await target.channel.setNSFW(
    enabled,
    `Noi: переключение NSFW комнаты пользователем ${actor.user.tag}`,
  );

  return resolvePanelTargetByChannelId(actor, target.channel.id);
}

export async function setVoiceChannelRegion(
  target: ResolvedPanelTarget,
  actor: GuildMember,
  rawRegion: string,
): Promise<ResolvedPanelTarget> {
  assertManageAccess(target);
  const rtcRegion = normalizeRegion(rawRegion);

  await target.channel.setRTCRegion(
    rtcRegion,
    `Noi: изменение региона комнаты пользователем ${actor.user.tag}`,
  );

  return resolvePanelTargetByChannelId(actor, target.channel.id);
}

export async function setVoiceChannelStatus(
  target: ResolvedPanelTarget,
  actor: GuildMember,
  rawStatus: string,
): Promise<string> {
  assertManageAccess(target);
  assertBotCanSetVoiceStatus(target.channel);
  const status = normalizeVoiceStatus(rawStatus);

  await actor.client.rest.put(`/channels/${target.channel.id}/voice-status`, {
    body: { status },
    reason: `Noi: изменение статуса комнаты пользователем ${actor.user.tag}`,
  });

  return status;
}

export async function transferVoiceChannelOwnership(
  target: ResolvedPanelTarget,
  actor: GuildMember,
  nextOwner: GuildMember,
): Promise<ResolvedPanelTarget> {
  assertManageAccess(target);

  if (nextOwner.user.bot || nextOwner.id === target.record.ownerUserId) {
    throw new VoiceControlServiceError(
      'TRANSFER_TO_SELF',
      'Передайте владение реальному участнику, который ещё не является владельцем этой комнаты.',
    );
  }

  if (nextOwner.voice.channelId !== target.channel.id || !target.channel.members.has(nextOwner.id)) {
    throw new VoiceControlServiceError(
      'TRANSFER_TARGET_INVALID',
      'Передать владение можно только участнику, который сейчас находится в этой комнате.',
    );
  }

  if (target.record.isLocked) {
    await ensurePermissionIfNeutral(target.channel, nextOwner.id, 'Connect');
  }

  if (isVoiceRoomGhosted(target.channel)) {
    await ensurePermissionIfNeutral(target.channel, nextOwner.id, 'ViewChannel');
  }

  updateTempChannelOwner(target.channel.id, nextOwner.id);
  const updatedTarget = await resolvePanelTargetByChannelId(nextOwner, target.channel.id);
  await syncLinkedTempTextChannelForTarget(updatedTarget);

  return updatedTarget;
}

export async function permitVoiceAccess(
  target: ResolvedPanelTarget,
  actor: GuildMember,
  accessTarget: AccessTarget,
): Promise<ResolvedPanelTarget> {
  assertManageAccess(target);

  await target.channel.permissionOverwrites.edit(accessTarget.id, {
    Connect: true,
  });

  return resolvePanelTargetByChannelId(actor, target.channel.id);
}

export async function removeVoiceAccessPermit(
  target: ResolvedPanelTarget,
  actor: GuildMember,
  member: GuildMember,
): Promise<ResolvedPanelTarget> {
  assertManageAccess(target);

  await clearManagedPermission(target.channel, member.id, 'Connect', 'allow');

  return resolvePanelTargetByChannelId(actor, target.channel.id);
}

export async function rejectVoiceAccess(
  target: ResolvedPanelTarget,
  actor: GuildMember,
  accessTarget: AccessTarget,
): Promise<ResolvedPanelTarget> {
  assertManageAccess(target);

  if ('user' in accessTarget && accessTarget.id === target.record.ownerUserId) {
    throw new VoiceControlServiceError(
      'REJECT_OWNER_NOT_ALLOWED',
      'Нельзя отклонить текущего владельца комнаты.',
    );
  }

  if (!('user' in accessTarget)) {
    if (accessTarget.id === target.channel.guild.roles.everyone.id) {
      throw new VoiceControlServiceError(
        'REJECT_EVERYONE_NOT_ALLOWED',
        'Для всей роли `@everyone` используйте `/voice lock` или `/voice ghost`, а не `/voice reject`.',
      );
    }

    if (
      accessTarget.permissions.has(PermissionFlagsBits.Administrator)
      || accessTarget.permissions.has(PermissionFlagsBits.ManageChannels)
    ) {
      throw new VoiceControlServiceError(
        'REJECT_ADMIN_ROLE_NOT_ALLOWED',
        'Нельзя отклонить роль администратора или управления каналами.',
      );
    }
  }

  await target.channel.permissionOverwrites.edit(accessTarget.id, {
    Connect: false,
  });

  if ('user' in accessTarget && accessTarget.voice.channelId === target.channel.id) {
    await accessTarget.voice.disconnect(`Noi: отклонение доступа владельцем ${actor.user.tag}`);
  }

  return resolvePanelTargetByChannelId(actor, target.channel.id);
}

export async function unbanVoiceAccess(
  target: ResolvedPanelTarget,
  actor: GuildMember,
  member: GuildMember,
): Promise<ResolvedPanelTarget> {
  assertManageAccess(target);

  await clearManagedPermission(target.channel, member.id, 'Connect', 'deny');

  return resolvePanelTargetByChannelId(actor, target.channel.id);
}

export async function kickVoiceMember(
  target: ResolvedPanelTarget,
  actor: GuildMember,
  member: GuildMember,
): Promise<ResolvedPanelTarget> {
  assertManageAccess(target);

  if (member.id === target.record.ownerUserId) {
    throw new VoiceControlServiceError(
      'KICK_OWNER_NOT_ALLOWED',
      'Нельзя выкинуть текущего владельца комнаты через эту кнопку.',
    );
  }

  if (member.voice.channelId !== target.channel.id || !target.channel.members.has(member.id)) {
    throw new VoiceControlServiceError(
      'KICK_TARGET_NOT_IN_ROOM',
      'Этот участник сейчас не находится в вашей временной комнате.',
    );
  }

  await member.voice.disconnect(`Noi: удаление участника владельцем ${actor.user.tag}`);
  return resolvePanelTargetByChannelId(actor, target.channel.id);
}

export async function createVoiceChannelInvite(
  target: ResolvedPanelTarget,
  actor: GuildMember,
  member: GuildMember,
  customMessage?: string | null,
): Promise<{ inviteUrl: string; deliveredViaDm: boolean }> {
  assertManageAccess(target);

  const invite = await target.channel.createInvite({
    maxAge: 3_600,
    maxUses: 1,
    unique: true,
    reason: `Noi: инвайт в комнату создан пользователем ${actor.user.tag}`,
  });

  try {
    const messagePrefix = customMessage?.trim()
      ? `${customMessage.trim()}\n\n`
      : '';

    await member.send({
      content: `<@${actor.id}> приглашает вас в голосовую комнату <#${target.channel.id}> на сервере **${target.channel.guild.name}**.\n\n${messagePrefix}${invite.url}`,
    });

    return {
      inviteUrl: invite.url,
      deliveredViaDm: true,
    };
  } catch {
    return {
      inviteUrl: invite.url,
      deliveredViaDm: false,
    };
  }
}

export async function deleteVoiceChannel(
  target: ResolvedPanelTarget,
  actor: GuildMember,
): Promise<void> {
  assertManageAccess(target);

  const trackedRecord = findTempChannelByChannelId(target.channel.id);

  if (!trackedRecord) {
    throw new VoiceControlServiceError(
      'REQUEST_TARGET_NOT_FOUND',
      'Комната больше не подтверждается в базе данных Noi и не будет удалена автоматически.',
    );
  }

  await target.channel.delete(`Noi: удаление комнаты пользователем ${actor.user.tag}`);
  await deleteTrackedTempChannelArtifacts(actor.guild, target.channel.id);
}

export async function requestVoiceAccess(
  requester: GuildMember,
  owner: GuildMember,
): Promise<{ channel: VoiceChannel; ownerId: string }> {
  if (requester.id === owner.id) {
    throw new VoiceControlServiceError(
      'REQUEST_SELF_NOT_ALLOWED',
      'Нельзя запросить доступ к собственной комнате.',
    );
  }

  const record = findTempChannelByOwner(requester.guild.id, owner.id);

  if (!record) {
    throw new VoiceControlServiceError(
      'REQUEST_TARGET_NOT_FOUND',
      'У этого участника сейчас нет отслеживаемой временной комнаты Noi.',
    );
  }

  const channel = await fetchTrackedTempVoiceChannel(requester.guild, record.channelId);

  if (requester.voice.channelId === channel.id || channel.members.has(requester.id)) {
    throw new VoiceControlServiceError(
      'REQUEST_ALREADY_IN_ROOM',
      'Вы уже находитесь в этой комнате.',
    );
  }

  await channel.send({
    content: `<@${owner.id}>, <@${requester.id}> запросил(а) доступ к вашей комнате. Если хотите впустить участника, используйте \`/voice permit\` и выберите его в параметре \`mention\`.`,
  });

  return {
    channel,
    ownerId: owner.id,
  };
}

export function resolveSingleAccessTarget(
  member: GuildMember | null,
  role: Role | null,
): AccessTarget {
  if ((member && role) || (!member && !role)) {
    throw new VoiceControlServiceError(
      'INVALID_ACCESS_TARGET',
      'Укажите ровно одну цель: либо пользователя, либо роль.',
    );
  }

  return member ?? role!;
}

export function describeAccessChange(action: 'permit' | 'reject', accessTarget: AccessTarget): string {
  const targetLabel = describeTarget(accessTarget);

  return action === 'permit'
    ? `Подключение для ${targetLabel} разрешено.`
    : `Подключение для ${targetLabel} запрещено.`;
}
