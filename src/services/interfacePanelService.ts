import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  ModalBuilder,
  StringSelectMenuBuilder,
  TextInputBuilder,
  TextInputStyle,
  type Guild,
  type GuildMember,
  type InteractionReplyOptions,
  type ModalActionRowComponentBuilder,
} from 'discord.js';

import {
  COMMON_VOICE_REGION_IDS,
  INTERFACE_CUSTOM_ID_PREFIX,
  INTERFACE_DELETE_CANCEL_ID,
  INTERFACE_DELETE_CONFIRM_ID,
  INTERFACE_LIMIT_INPUT_ID,
  INTERFACE_MEMBER_INPUT_ID,
  INTERFACE_MESSAGE_TITLE,
  INTERFACE_REGION_SELECT_ID,
  PANEL_RENAME_INPUT_ID,
} from '../config/constants';
import { findTempChannelByOwner } from '../db/repositories/tempChannelsRepo';
import { applyBotAvatarEmbedColor } from '../utils/embedColor';
import {
  PanelServiceError,
  resolvePanelTargetByChannelId,
  type ResolvedPanelTarget,
} from './panelService';

const INTERFACE_ACTIONS = [
  'rename',
  'limit',
  'toggle_access',
  'region',
  'permit',
  'remove_permit',
  'invite',
  'kick',
  'ban',
  'unban',
  'claim',
  'transfer',
  'delete',
] as const;

const MEMBER_INPUT_ACTIONS = [
  'permit',
  'remove_permit',
  'invite',
  'kick',
  'ban',
  'unban',
  'transfer',
] as const;

export type InterfaceAction = (typeof INTERFACE_ACTIONS)[number];
export type MemberInputAction = (typeof MEMBER_INPUT_ACTIONS)[number];

export class InterfacePanelError extends Error {
  public constructor(
    public readonly code:
      | 'TEMP_CHANNEL_NOT_FOUND'
      | 'INVALID_MEMBER_REFERENCE'
      | 'MEMBER_NOT_FOUND'
      | 'TARGET_BOT_NOT_ALLOWED',
    message: string,
  ) {
    super(message);
    this.name = 'InterfacePanelError';
  }
}

function buildActionCustomId(action: InterfaceAction): string {
  return `${INTERFACE_CUSTOM_ID_PREFIX}:${action}`;
}

function buildModalCustomId(action: 'rename' | 'limit' | MemberInputAction): string {
  return `${INTERFACE_CUSTOM_ID_PREFIX}:modal:${action}`;
}

function buildLegendGrid(): string {
  return [
    '```text',
    'Rename      Limit       Access      Region',
    'Permit      Unlist      Invite      Kick',
    'Ban         Unban       Claim       Transfer    Delete',
    '```',
  ].join('\n');
}

function buildRegionOptions(currentValue: string | null): Array<{
  label: string;
  value: string;
  default: boolean;
}> {
  return COMMON_VOICE_REGION_IDS.map((region) => ({
    label: region === 'auto' ? 'auto (Discord выбирает сам)' : region,
    value: region,
    default: region === (currentValue ?? 'auto'),
  }));
}

export async function buildPersistentInterfaceEmbed(guild: Guild): Promise<EmbedBuilder> {
  const embed = new EmbedBuilder()
    .setTitle(INTERFACE_MESSAGE_TITLE)
    .setDescription(
      [
        '**One interface, many owners.** Noi применяет действие к временной комнате, связанной с **вашим Discord ID**.',
        '**Все ответы приватные.** Любой результат или ошибка ниже видны только тому, кто нажал кнопку.',
        buildLegendGrid(),
      ].join('\n\n'),
    )
    .addFields(
      {
        name: 'Канал',
        value: 'Rename, Limit, Access, Region',
        inline: false,
      },
      {
        name: 'Участники',
        value: 'Permit, Unlist, Invite, Kick, Ban, Unban',
        inline: false,
      },
      {
        name: 'Владение',
        value: 'Claim, Transfer, Delete',
        inline: false,
      },
    );

  return applyBotAvatarEmbedColor(embed, guild.client);
}

export function buildPersistentInterfaceComponents(): ActionRowBuilder<ButtonBuilder>[] {
  return [
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(buildActionCustomId('rename'))
        .setLabel('Rename')
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId(buildActionCustomId('limit'))
        .setLabel('Limit')
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId(buildActionCustomId('toggle_access'))
        .setLabel('Access')
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId(buildActionCustomId('region'))
        .setLabel('Region')
        .setStyle(ButtonStyle.Secondary),
    ),
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(buildActionCustomId('permit'))
        .setLabel('Permit')
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId(buildActionCustomId('remove_permit'))
        .setLabel('Unlist')
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId(buildActionCustomId('invite'))
        .setLabel('Invite')
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId(buildActionCustomId('kick'))
        .setLabel('Kick')
        .setStyle(ButtonStyle.Danger),
    ),
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(buildActionCustomId('ban'))
        .setLabel('Ban')
        .setStyle(ButtonStyle.Danger),
      new ButtonBuilder()
        .setCustomId(buildActionCustomId('unban'))
        .setLabel('Unban')
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId(buildActionCustomId('claim'))
        .setLabel('Claim')
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId(buildActionCustomId('transfer'))
        .setLabel('Transfer')
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId(buildActionCustomId('delete'))
        .setLabel('Delete')
        .setStyle(ButtonStyle.Danger),
    ),
  ];
}

export function buildRegionSelectionReply(target: ResolvedPanelTarget): InteractionReplyOptions {
  return {
    content: `Выберите регион для комнаты <#${target.channel.id}>.`,
    components: [
      new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId(INTERFACE_REGION_SELECT_ID)
          .setPlaceholder('Выберите регион голосового канала')
          .addOptions(buildRegionOptions(target.channel.rtcRegion)),
      ),
    ],
    ephemeral: true,
  };
}

export function buildDeleteConfirmationReply(target: ResolvedPanelTarget): InteractionReplyOptions {
  return {
    content: `Удалить временную комнату <#${target.channel.id}>? Это действие необратимо.`,
    components: [
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId(INTERFACE_DELETE_CONFIRM_ID)
          .setLabel('Удалить')
          .setStyle(ButtonStyle.Danger),
        new ButtonBuilder()
          .setCustomId(INTERFACE_DELETE_CANCEL_ID)
          .setLabel('Отмена')
          .setStyle(ButtonStyle.Secondary),
      ),
    ],
    ephemeral: true,
  };
}

export function buildRenameInterfaceModal(currentName: string): ModalBuilder {
  const input = new TextInputBuilder()
    .setCustomId(PANEL_RENAME_INPUT_ID)
    .setLabel('Новое название комнаты')
    .setRequired(true)
    .setMinLength(1)
    .setMaxLength(50)
    .setStyle(TextInputStyle.Short)
    .setValue(currentName);

  return new ModalBuilder()
    .setCustomId(buildModalCustomId('rename'))
    .setTitle('Переименовать комнату')
    .addComponents(new ActionRowBuilder<ModalActionRowComponentBuilder>().addComponents(input));
}

export function buildLimitInterfaceModal(currentLimit: number): ModalBuilder {
  const input = new TextInputBuilder()
    .setCustomId(INTERFACE_LIMIT_INPUT_ID)
    .setLabel('Лимит участников (0-99)')
    .setRequired(true)
    .setStyle(TextInputStyle.Short)
    .setValue(String(currentLimit));

  return new ModalBuilder()
    .setCustomId(buildModalCustomId('limit'))
    .setTitle('Изменить лимит комнаты')
    .addComponents(new ActionRowBuilder<ModalActionRowComponentBuilder>().addComponents(input));
}

function getMemberModalTitle(action: MemberInputAction): string {
  switch (action) {
    case 'permit':
      return 'Добавить в whitelist';
    case 'remove_permit':
      return 'Убрать из whitelist';
    case 'invite':
      return 'Отправить инвайт';
    case 'kick':
      return 'Выкинуть участника';
    case 'ban':
      return 'Забанить участника';
    case 'unban':
      return 'Разбанить участника';
    case 'transfer':
      return 'Передать владение';
    default:
      return 'Указать участника';
  }
}

export function buildMemberActionModal(action: MemberInputAction): ModalBuilder {
  const input = new TextInputBuilder()
    .setCustomId(INTERFACE_MEMBER_INPUT_ID)
    .setLabel('Участник: mention или ID')
    .setPlaceholder('@username или 123456789012345678')
    .setRequired(true)
    .setStyle(TextInputStyle.Short);

  return new ModalBuilder()
    .setCustomId(buildModalCustomId(action))
    .setTitle(getMemberModalTitle(action))
    .addComponents(new ActionRowBuilder<ModalActionRowComponentBuilder>().addComponents(input));
}

export function matchesPersistentInterfaceInteraction(customId: string): boolean {
  return customId.startsWith(`${INTERFACE_CUSTOM_ID_PREFIX}:`);
}

export function parsePersistentInterfaceAction(customId: string): InterfaceAction | null {
  const parts = customId.split(':');

  if (parts.length !== 3 || `${parts[0]}:${parts[1]}` !== INTERFACE_CUSTOM_ID_PREFIX) {
    return null;
  }

  const action = parts[2] as InterfaceAction;
  return INTERFACE_ACTIONS.includes(action) ? action : null;
}

export function parsePersistentInterfaceModalAction(
  customId: string,
): 'rename' | 'limit' | MemberInputAction | null {
  const parts = customId.split(':');

  if (parts.length !== 4 || `${parts[0]}:${parts[1]}` !== INTERFACE_CUSTOM_ID_PREFIX || parts[2] !== 'modal') {
    return null;
  }

  const action = parts[3] as 'rename' | 'limit' | MemberInputAction;

  if (action === 'rename' || action === 'limit' || MEMBER_INPUT_ACTIONS.includes(action)) {
    return action;
  }

  return null;
}

export async function resolvePersistentInterfaceTarget(member: GuildMember): Promise<ResolvedPanelTarget> {
  const ownedRecord = findTempChannelByOwner(member.guild.id, member.id);

  if (ownedRecord) {
    return resolvePanelTargetByChannelId(member, ownedRecord.channelId);
  }

  if (member.voice.channelId) {
    return resolvePanelTargetByChannelId(member, member.voice.channelId);
  }

  throw new PanelServiceError(
    'TEMP_CHANNEL_NOT_FOUND',
    'У вас сейчас нет временной комнаты Noi, привязанной к вашему аккаунту.',
  );
}

export async function resolveGuildMemberFromInput(
  guild: Guild,
  rawInput: string,
): Promise<GuildMember> {
  const normalized = rawInput.trim();
  const userIdMatch = normalized.match(/^<@!?(\d+)>$/) ?? normalized.match(/^(\d{17,20})$/);
  const userId = userIdMatch?.[1];

  if (!userId) {
    throw new InterfacePanelError(
      'INVALID_MEMBER_REFERENCE',
      'Укажите участника через mention или числовой Discord ID.',
    );
  }

  try {
    const member = await guild.members.fetch(userId);

    if (member.user.bot) {
      throw new InterfacePanelError(
        'TARGET_BOT_NOT_ALLOWED',
        'Для этой операции нужно указать обычного участника, а не бота.',
      );
    }

    return member;
  } catch (error) {
    if (error instanceof InterfacePanelError) {
      throw error;
    }

    throw new InterfacePanelError(
      'MEMBER_NOT_FOUND',
      'Не удалось найти этого участника на сервере.',
    );
  }
}
