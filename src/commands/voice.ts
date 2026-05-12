import type {
  ApplicationCommandOptionChoiceData,
  AutocompleteInteraction,
  Guild,
  VoiceRegion,
} from 'discord.js';
import { GuildMember, Role, SlashCommandBuilder } from 'discord.js';

import { COMMON_VOICE_REGION_IDS } from '../config/constants';
import {
  claimPanelChannel,
  lockPanelChannel,
  PanelServiceError,
  renamePanelChannel,
  resolvePanelTarget,
  setPanelChannelUserLimit,
  unlockPanelChannel,
} from '../services/panelService';
import type { AppCommand } from '../types';
import { safeReply } from '../utils/safeReply';
import {
  createVoiceChannelInvite,
  describeAccessChange,
  formatVoiceBitrate,
  formatVoiceRegion,
  ghostVoiceChannel,
  isVoiceRoomGhosted,
  permitVoiceAccess,
  rejectVoiceAccess,
  setVoiceChannelBitrate,
  setVoiceChannelNsfw,
  setVoiceChannelRegion,
  setVoiceChannelStatus,
  transferVoiceChannelOwnership,
  unghostVoiceChannel,
  VoiceControlServiceError,
} from '../services/voiceControlService';

const DEFAULT_BITRATE_CHOICES_KBPS = [8, 16, 24, 32, 40, 48, 64, 80, 96, 128, 256, 384] as const;
const FALLBACK_VOICE_REGION_IDS = COMMON_VOICE_REGION_IDS.filter((region) => region !== 'auto');
const BLOCKED_SUBCOMMAND_MESSAGES = {
  lfm: '`/voice lfm` временно отключена и скрыта из активных slash-команд Noi.',
} as const;

function formatUserLimit(limit: number): string {
  return limit === 0 ? 'без лимита' : `${limit}`;
}

function formatRoomState(target: Awaited<ReturnType<typeof resolvePanelTarget>>): string {
  const ghosted = isVoiceRoomGhosted(target.channel) ? 'скрыта' : 'видима';
  const locked = target.record.isLocked ? 'закрыта' : 'открыта';

  return [
    `Комната: <#${target.channel.id}>`,
    `Статус: ${locked}`,
    `Видимость: ${ghosted}`,
    `Лимит: ${formatUserLimit(target.channel.userLimit)}`,
    `Битрейт: ${formatVoiceBitrate(target.channel)}`,
    `Регион: ${formatVoiceRegion(target.channel)}`,
  ].join('\n');
}

function buildVoiceReply(title: string, target: Awaited<ReturnType<typeof resolvePanelTarget>>): string {
  return `${title}\n\n${formatRoomState(target)}`;
}

export function getAvailableBitrateChoices(guild: Guild | null, focusedValue?: number | null): number[] {
  const maxBitrateKbps = guild ? Math.floor(guild.maximumBitrate / 1_000) : 96;
  const exactFocusedChoice = typeof focusedValue === 'number'
    && Number.isInteger(focusedValue)
    && focusedValue >= 8
    && focusedValue <= maxBitrateKbps
    ? [focusedValue]
    : [];

  return Array.from(new Set([
    ...exactFocusedChoice,
    ...DEFAULT_BITRATE_CHOICES_KBPS.filter((choice) => choice <= maxBitrateKbps),
  ])).sort((left, right) => left - right);
}

export async function respondWithBitrateAutocomplete(
  interaction: AutocompleteInteraction,
  availableChoices: number[],
): Promise<void> {
  const raw = String(interaction.options.getFocused()).trim();
  const choices = availableChoices
    .filter((choice) => raw.length === 0 || String(choice).startsWith(raw))
    .slice(0, 25)
    .map((choice) => ({
      name: `${choice} kbps`,
      value: choice,
    }));

  await interaction.respond(choices);
}

async function fetchAvailableVoiceRegionIds(interaction: AutocompleteInteraction): Promise<string[]> {
  try {
    const regions = await interaction.client.fetchVoiceRegions();
    const values = regions
      ? Array.from(regions.values()).map((region: VoiceRegion) => region.id)
      : [...FALLBACK_VOICE_REGION_IDS];

    return Array.from(new Set(['auto', ...values]));
  } catch {
    return ['auto', ...FALLBACK_VOICE_REGION_IDS];
  }
}

async function respondWithRegionAutocomplete(interaction: AutocompleteInteraction): Promise<void> {
  const raw = String(interaction.options.getFocused()).trim().toLowerCase();
  const uniqueValues = await fetchAvailableVoiceRegionIds(interaction);
  const choices: ApplicationCommandOptionChoiceData<string>[] = uniqueValues
    .filter((region) => raw.length === 0 || region.includes(raw))
    .slice(0, 25)
    .map((region) => ({
      name: region === 'auto' ? 'auto (Discord выбирает сам)' : region,
      value: region,
    }));

  await interaction.respond(choices);
}

async function resolveMentionableAccessTarget(
  interaction: Parameters<AppCommand['execute']>[0],
): Promise<GuildMember | Role> {
  const role = interaction.options.getRole('mention');

  if (role instanceof Role) {
    return role;
  }

  const member = interaction.options.getMember('mention');

  if (member instanceof GuildMember) {
    return member;
  }

  const user = interaction.options.getUser('mention', true);
  return interaction.guild!.members.fetch(user.id);
}

export const voiceCommand: AppCommand = {
  data: new SlashCommandBuilder()
    .setName('voice')
    .setDescription('Команды управления временной комнатой Noi.')
    .addSubcommand((subcommand) =>
      subcommand
        .setName('name')
        .setDescription('Переименовать свою временную голосовую комнату.')
        .addStringOption((option) =>
          option
            .setName('name')
            .setDescription('Новое название комнаты')
            .setRequired(true)
            .setMinLength(1)
            .setMaxLength(50),
        ),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('lock')
        .setDescription('Закрыть свою временную голосовую комнату для новых подключений.'),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('unlock')
        .setDescription('Открыть свою временную голосовую комнату для новых подключений.'),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('limit')
        .setDescription('Изменить лимит участников во временной голосовой комнате.')
        .addIntegerOption((option) =>
          option
            .setName('limit')
            .setDescription('Новый лимит участников: 0..99, где 0 отключает лимит')
            .setRequired(true)
            .setMinValue(0)
            .setMaxValue(99),
        ),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('claim')
        .setDescription('Забрать владение временной комнатой, если владелец отсутствует.'),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('transfer')
        .setDescription('Передать владение комнатой другому участнику внутри комнаты.')
        .addUserOption((option) =>
          option
            .setName('user')
            .setDescription('Новый владелец комнаты')
            .setRequired(true),
        ),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('permit')
        .setDescription('Разрешить конкретному пользователю или роли подключаться к комнате.')
        .addMentionableOption((option) =>
          option
            .setName('mention')
            .setDescription('Пользователь или роль, которым нужно разрешить вход')
            .setRequired(true),
        ),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('reject')
        .setDescription('Запретить доступ пользователю или роли, при необходимости выгнав пользователя.')
        .addMentionableOption((option) =>
          option
            .setName('mention')
            .setDescription('Пользователь или роль, которым нужно запретить вход')
            .setRequired(true),
        ),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('status')
        .setDescription('Обновить status голосовой комнаты.')
        .addStringOption((option) =>
          option
            .setName('status')
            .setDescription('Новый status комнаты, который увидят участники')
            .setRequired(true)
            .setMinLength(1)
            .setMaxLength(500),
        ),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('bitrate')
        .setDescription('Изменить битрейт комнаты в kbps.')
        .addIntegerOption((option) =>
          option
            .setName('bitrate')
            .setDescription('Новый битрейт в kbps; можно выбрать подсказку или ввести своё значение')
            .setRequired(true)
            .setAutocomplete(true),
        ),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('ghost')
        .setDescription('Скрыть комнату из списка каналов для обычных участников.'),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('unghost')
        .setDescription('Снова сделать комнату видимой для обычных участников.'),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('nsfw')
        .setDescription('Включить или выключить NSFW-режим для комнаты.')
        .addBooleanOption((option) =>
          option
            .setName('toggle')
            .setDescription('Нужно ли включить NSFW')
            .setRequired(true),
        ),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('region')
        .setDescription('Переопределить голосовой регион или вернуть авто-режим.')
        .addStringOption((option) =>
          option
            .setName('region')
            .setDescription('Доступный голосовой регион или auto; список подсказывается автодополнением')
            .setRequired(true)
            .setAutocomplete(true),
        ),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('invite')
        .setDescription('Отправить direct invite пользователю в вашу временную комнату.')
        .addUserOption((option) =>
          option
            .setName('member')
            .setDescription('Пользователь, которого нужно пригласить')
            .setRequired(true),
        )
        .addStringOption((option) =>
          option
            .setName('message')
            .setDescription('Дополнительное сообщение для личного приглашения')
            .setRequired(false)
            .setMaxLength(300),
        ),
    ),
  async autocomplete(interaction) {
    const focused = interaction.options.getFocused(true);
    const subcommand = interaction.options.getSubcommand();

    if (subcommand === 'bitrate' && focused.name === 'bitrate') {
      const focusedValue = typeof focused.value === 'number' ? focused.value : null;
      await respondWithBitrateAutocomplete(
        interaction,
        getAvailableBitrateChoices(interaction.guild, focusedValue),
      );
      return;
    }

    if (subcommand === 'region' && focused.name === 'region') {
      await respondWithRegionAutocomplete(interaction);
      return;
    }

    await interaction.respond([]);
  },
  async execute(interaction, context) {
    if (!interaction.inGuild() || !interaction.guild) {
      await safeReply(interaction, {
        content: 'Эту команду можно использовать только внутри сервера.',
        ephemeral: true,
      });
      return;
    }

    await interaction.deferReply({ ephemeral: true });

    try {
      const actor = await interaction.guild.members.fetch(interaction.user.id);
      const subcommand = interaction.options.getSubcommand();

      if (subcommand === 'lfm') {
        context.logger.info({
          event: 'voice_subcommand_blocked_by_scope',
          guildId: interaction.guild.id,
          userId: interaction.user.id,
          subcommand,
        });

        await safeReply(interaction, {
          content: BLOCKED_SUBCOMMAND_MESSAGES[subcommand],
          ephemeral: true,
        });
        return;
      }

      if (subcommand === 'tts') {
        context.logger.info({
          event: 'voice_tts_temporarily_disabled',
          guildId: interaction.guild.id,
          userId: interaction.user.id,
        });

        await safeReply(interaction, {
          content: '`/voice tts` временно отключён и скрыт из активных slash-команд, пока мы разбираемся со стабильностью voice/TTS. Остальные `/voice ...` команды продолжают работать.',
          ephemeral: true,
        });
        return;
      }

      const target = await resolvePanelTarget(actor);

      if (subcommand === 'name') {
        const newName = interaction.options.getString('name', true);
        const updatedTarget = await renamePanelChannel(target, actor, newName);

        context.logger.info({
          event: 'voice_name_used',
          guildId: interaction.guild.id,
          userId: interaction.user.id,
          channelId: updatedTarget.channel.id,
        });

        await safeReply(interaction, {
          content: buildVoiceReply(`Название комнаты обновлено на **${updatedTarget.channel.name}**.`, updatedTarget),
        });
        return;
      }

      if (subcommand === 'lock' || subcommand === 'unlock') {
        const updatedTarget = subcommand === 'lock'
          ? await lockPanelChannel(target)
          : await unlockPanelChannel(target);

        context.logger.info({
          event: `voice_${subcommand}_used`,
          guildId: interaction.guild.id,
          userId: interaction.user.id,
          channelId: updatedTarget.channel.id,
        });

        await safeReply(interaction, {
          content: buildVoiceReply(
            subcommand === 'lock'
              ? 'Комната закрыта для новых подключений.'
              : 'Комната снова открыта для новых подключений.',
            updatedTarget,
          ),
        });
        return;
      }

      if (subcommand === 'limit') {
        const limit = interaction.options.getInteger('limit', true);
        const updatedTarget = await setPanelChannelUserLimit(target, limit, actor);

        context.logger.info({
          event: 'voice_limit_used',
          guildId: interaction.guild.id,
          userId: interaction.user.id,
          channelId: updatedTarget.channel.id,
          userLimit: limit,
        });

        await safeReply(interaction, {
          content: buildVoiceReply(`Лимит комнаты обновлён: **${formatUserLimit(updatedTarget.channel.userLimit)}**.`, updatedTarget),
        });
        return;
      }

      if (subcommand === 'claim') {
        const updatedTarget = await claimPanelChannel(target, actor);

        context.logger.info({
          event: 'voice_claim_used',
          guildId: interaction.guild.id,
          userId: interaction.user.id,
          channelId: updatedTarget.channel.id,
        });

        await safeReply(interaction, {
          content: buildVoiceReply('Владение комнатой передано вам.', updatedTarget),
        });
        return;
      }

      if (subcommand === 'transfer') {
        const nextOwnerUser = interaction.options.getUser('user', true);
        const nextOwner = await interaction.guild.members.fetch(nextOwnerUser.id);
        const updatedTarget = await transferVoiceChannelOwnership(target, actor, nextOwner);

        context.logger.info({
          event: 'voice_transfer_used',
          guildId: interaction.guild.id,
          userId: interaction.user.id,
          channelId: updatedTarget.channel.id,
          nextOwnerUserId: nextOwner.id,
        });

        await safeReply(interaction, {
          content: buildVoiceReply(`Владение комнатой передано участнику <@${nextOwner.id}>.`, updatedTarget),
        });
        return;
      }

      if (subcommand === 'permit' || subcommand === 'reject') {
        const accessTarget = await resolveMentionableAccessTarget(interaction);
        const updatedTarget = subcommand === 'permit'
          ? await permitVoiceAccess(target, actor, accessTarget)
          : await rejectVoiceAccess(target, actor, accessTarget);

        context.logger.info({
          event: `voice_${subcommand}_used`,
          guildId: interaction.guild.id,
          userId: interaction.user.id,
          channelId: updatedTarget.channel.id,
          targetId: accessTarget.id,
          targetType: accessTarget instanceof Role ? 'role' : 'user',
        });

        await safeReply(interaction, {
          content: `${describeAccessChange(subcommand, accessTarget)}\n\n${formatRoomState(updatedTarget)}`,
        });
        return;
      }

      if (subcommand === 'status') {
        const status = interaction.options.getString('status', true);
        const appliedStatus = await setVoiceChannelStatus(target, actor, status);
        const updatedTarget = await resolvePanelTarget(actor);

        context.logger.info({
          event: 'voice_status_used',
          guildId: interaction.guild.id,
          userId: interaction.user.id,
          channelId: updatedTarget.channel.id,
        });

        await safeReply(interaction, {
          content: `${buildVoiceReply('Статус комнаты обновлён.', updatedTarget)}\n\nНовый status: ${appliedStatus}`,
        });
        return;
      }

      if (subcommand === 'text') {
        context.logger.info({
          event: 'voice_text_deprecated',
          guildId: interaction.guild.id,
          userId: interaction.user.id,
          channelId: target.channel.id,
        });

        await safeReply(interaction, {
          content: `${buildVoiceReply('Отдельный текстовый канал больше не требуется.', target)}\n\nИспользуйте встроенный чат этой голосовой комнаты. Озвучка TTS сейчас временно отключена.`,
          ephemeral: true,
        });
        return;
      }

      if (subcommand === 'bitrate') {
        const bitrate = interaction.options.getInteger('bitrate', true);
        const updatedTarget = await setVoiceChannelBitrate(target, actor, bitrate);

        context.logger.info({
          event: 'voice_bitrate_used',
          guildId: interaction.guild.id,
          userId: interaction.user.id,
          channelId: updatedTarget.channel.id,
          bitrateKbps: bitrate,
        });

        await safeReply(interaction, {
          content: buildVoiceReply(`Битрейт комнаты обновлён: **${formatVoiceBitrate(updatedTarget.channel)}**.`, updatedTarget),
        });
        return;
      }

      if (subcommand === 'ghost' || subcommand === 'unghost') {
        const updatedTarget = subcommand === 'ghost'
          ? await ghostVoiceChannel(target, actor)
          : await unghostVoiceChannel(target, actor);

        context.logger.info({
          event: `voice_${subcommand}_used`,
          guildId: interaction.guild.id,
          userId: interaction.user.id,
          channelId: updatedTarget.channel.id,
        });

        await safeReply(interaction, {
          content: buildVoiceReply(
            subcommand === 'ghost'
              ? 'Комната скрыта из списка каналов для обычных участников.'
              : 'Комната снова видима в списке каналов.',
            updatedTarget,
          ),
        });
        return;
      }

      if (subcommand === 'nsfw') {
        const toggle = interaction.options.getBoolean('toggle', true);
        const updatedTarget = await setVoiceChannelNsfw(target, actor, toggle);

        context.logger.info({
          event: 'voice_nsfw_used',
          guildId: interaction.guild.id,
          userId: interaction.user.id,
          channelId: updatedTarget.channel.id,
          enabled: toggle,
        });

        await safeReply(interaction, {
          content: buildVoiceReply(
            toggle ? 'NSFW-режим для комнаты включён.' : 'NSFW-режим для комнаты выключен.',
            updatedTarget,
          ),
        });
        return;
      }

      if (subcommand === 'region') {
        const region = interaction.options.getString('region', true);
        const updatedTarget = await setVoiceChannelRegion(target, actor, region);

        context.logger.info({
          event: 'voice_region_used',
          guildId: interaction.guild.id,
          userId: interaction.user.id,
          channelId: updatedTarget.channel.id,
          region,
        });

        await safeReply(interaction, {
          content: buildVoiceReply(`Регион комнаты обновлён: **${formatVoiceRegion(updatedTarget.channel)}**.`, updatedTarget),
        });
        return;
      }

      if (subcommand === 'invite') {
        const targetUser = interaction.options.getUser('member', true);
        const invitee = await interaction.guild.members.fetch(targetUser.id);
        const message = interaction.options.getString('message');
        const result = await createVoiceChannelInvite(target, actor, invitee, message);

        context.logger.info({
          event: 'voice_invite_used',
          guildId: interaction.guild.id,
          userId: interaction.user.id,
          channelId: target.channel.id,
          targetUserId: invitee.id,
          deliveredViaDm: result.deliveredViaDm,
        });

        await safeReply(interaction, {
          content: result.deliveredViaDm
            ? `Инвайт в комнату <#${target.channel.id}> отправлен участнику <@${invitee.id}> в личные сообщения.`
            : `Инвайт создан, но личные сообщения <@${invitee.id}> закрыты. Используйте ссылку вручную: ${result.inviteUrl}`,
        });
      }
    } catch (error) {
      if (
        error instanceof PanelServiceError
        || error instanceof VoiceControlServiceError
      ) {
        context.logger.warn({
          event: 'voice_command_blocked',
          guildId: interaction.guild.id,
          userId: interaction.user.id,
          code: error.code,
          message: error.message,
          subcommand: interaction.options.getSubcommand(),
        });

        await safeReply(interaction, {
          content: error.message,
          ephemeral: true,
        });
        return;
      }

      context.logger.error({
        event: 'voice_command_failed',
        guildId: interaction.guild.id,
        userId: interaction.user.id,
        subcommand: interaction.options.getSubcommand(),
      }, error);

      throw error;
    }
  },
};
