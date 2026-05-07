import {
  ChannelType,
  PermissionFlagsBits,
  type CategoryChannel,
  type Guild,
  type GuildMember,
  type VoiceChannel,
} from 'discord.js';

import {
  DEFAULT_CATEGORY_NAME,
  DEFAULT_BITRATE,
  DEFAULT_GENERATOR_CHANNEL_NAME,
  DEFAULT_MAX_TEMP_CHANNELS,
  DEFAULT_NAME_TEMPLATE,
  DEFAULT_USER_LIMIT,
} from '../config/constants';
import {
  findGuildSettingsByGuildId,
  upsertGuildSettings,
  type UpsertGuildSettingsInput,
} from '../db/repositories/guildSettingsRepo';
import type { GuildSettings, TempChannelPermissionSource } from '../types';

const REQUIRED_SETUP_PERMISSIONS = [
  PermissionFlagsBits.ManageChannels,
  PermissionFlagsBits.MoveMembers,
  PermissionFlagsBits.ViewChannel,
  PermissionFlagsBits.Connect,
  PermissionFlagsBits.SendMessages,
] as const;

const LEGACY_GENERATOR_CHANNEL_NAMES = ['➕ Join to Create'] as const;

const REQUIRED_SETUP_PERMISSION_NAMES = [
  'Manage Channels',
  'Move Members',
  'View Channels',
  'Connect',
  'Send Messages',
] as const;

export class SetupServiceError extends Error {
  public constructor(
    public readonly code: 'MISSING_BOT_PERMISSIONS' | 'BOT_MEMBER_UNAVAILABLE',
    message: string,
  ) {
    super(message);
    this.name = 'SetupServiceError';
  }
}

export interface SetupServiceResult {
  settings: GuildSettings;
  categoryCreated: boolean;
  generatorCreated: boolean;
}

export interface RunSetupOptions {
  editableByOwner: boolean;
  category?: CategoryChannel | null;
  permissionSource?: TempChannelPermissionSource;
}

async function getBotMember(guild: Guild): Promise<GuildMember> {
  if (guild.members.me) {
    return guild.members.me;
  }

  return guild.members.fetchMe();
}

function findExistingCategory(guild: Guild): CategoryChannel | null {
  const category = guild.channels.cache.find(
    (channel): channel is CategoryChannel =>
      channel.type === ChannelType.GuildCategory && channel.name === DEFAULT_CATEGORY_NAME,
  );

  return category ?? null;
}

function isUnknownChannelError(error: unknown): error is { code: number } {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 10003;
}

async function fetchConfiguredCategory(guild: Guild, categoryId: string | null | undefined): Promise<CategoryChannel | null> {
  if (!categoryId) {
    return null;
  }

  try {
    const channel = await guild.channels.fetch(categoryId);

    if (!channel || channel.type !== ChannelType.GuildCategory) {
      return null;
    }

    return channel;
  } catch (error) {
    if (isUnknownChannelError(error)) {
      return null;
    }

    throw error;
  }
}

function findExistingGenerator(guild: Guild, categoryId: string): VoiceChannel | null {
  const generator = guild.channels.cache.find(
    (channel): channel is VoiceChannel =>
      channel.type === ChannelType.GuildVoice &&
      channel.parentId === categoryId &&
      [DEFAULT_GENERATOR_CHANNEL_NAME, ...LEGACY_GENERATOR_CHANNEL_NAMES].includes(
        channel.name as (typeof LEGACY_GENERATOR_CHANNEL_NAMES)[number] | typeof DEFAULT_GENERATOR_CHANNEL_NAME,
      ),
  );

  return generator ?? null;
}

async function fetchConfiguredGenerator(guild: Guild, generatorChannelId: string | null | undefined): Promise<VoiceChannel | null> {
  if (!generatorChannelId) {
    return null;
  }

  try {
    const channel = await guild.channels.fetch(generatorChannelId);

    if (!channel || channel.type !== ChannelType.GuildVoice) {
      return null;
    }

    return channel;
  } catch (error) {
    if (isUnknownChannelError(error)) {
      return null;
    }

    throw error;
  }
}

function getMissingPermissions(botMember: GuildMember): string[] {
  const missingPermissions: string[] = [];

  REQUIRED_SETUP_PERMISSIONS.forEach((permission, index) => {
    if (botMember.permissions.has(permission)) {
      return;
    }

    missingPermissions.push(REQUIRED_SETUP_PERMISSION_NAMES[index] ?? String(permission));
  });

  return missingPermissions;
}

function toGuildSettingsInput(
  guildId: string,
  categoryId: string,
  generatorChannelId: string,
  options: RunSetupOptions,
  existingSettings: GuildSettings | null,
): UpsertGuildSettingsInput {
  const permissionSource = options.permissionSource ?? existingSettings?.permissionSource ?? 'category';

  return {
    guildId,
    categoryId,
    generatorChannelId,
    editableByOwner: options.editableByOwner,
    permissionSource,
    defaultNameTemplate: existingSettings?.defaultNameTemplate ?? DEFAULT_NAME_TEMPLATE,
    defaultUserLimit: existingSettings?.defaultUserLimit ?? DEFAULT_USER_LIMIT,
    defaultBitrate: existingSettings?.defaultBitrate ?? DEFAULT_BITRATE,
    language: existingSettings?.language ?? 'en',
    maxTempChannels: existingSettings?.maxTempChannels ?? DEFAULT_MAX_TEMP_CHANNELS,
    interfaceChannelId: existingSettings?.interfaceChannelId ?? null,
    interfaceMessageId: existingSettings?.interfaceMessageId ?? null,
  };
}

async function resolveSetupCategory(
  guild: Guild,
  requestedCategory: CategoryChannel | null | undefined,
  existingSettings: GuildSettings | null,
): Promise<{ category: CategoryChannel; categoryCreated: boolean }> {
  if (requestedCategory) {
    return {
      category: requestedCategory,
      categoryCreated: false,
    };
  }

  const configuredCategory = await fetchConfiguredCategory(guild, existingSettings?.categoryId);

  if (configuredCategory) {
    return {
      category: configuredCategory,
      categoryCreated: false,
    };
  }

  const namedCategory = findExistingCategory(guild);

  if (namedCategory) {
    return {
      category: namedCategory,
      categoryCreated: false,
    };
  }

  const category = await guild.channels.create({
    name: DEFAULT_CATEGORY_NAME,
    type: ChannelType.GuildCategory,
    reason: 'Первичная настройка XenoVoice',
  });

  return {
    category,
    categoryCreated: true,
  };
}

async function resolveSetupGenerator(
  guild: Guild,
  category: CategoryChannel,
  existingSettings: GuildSettings | null,
): Promise<{ generator: VoiceChannel; generatorCreated: boolean }> {
  const configuredGenerator = await fetchConfiguredGenerator(guild, existingSettings?.generatorChannelId);

  if (configuredGenerator && configuredGenerator.parentId === category.id) {
    return {
      generator: configuredGenerator,
      generatorCreated: false,
    };
  }

  const namedGenerator = findExistingGenerator(guild, category.id);

  if (namedGenerator) {
    return {
      generator: namedGenerator,
      generatorCreated: false,
    };
  }

  const generator = await guild.channels.create({
    name: DEFAULT_GENERATOR_CHANNEL_NAME,
    type: ChannelType.GuildVoice,
    parent: category.id,
    userLimit: DEFAULT_USER_LIMIT,
    reason: 'Первичная настройка XenoVoice',
  });

  return {
    generator,
    generatorCreated: true,
  };
}

export async function runSetup(guild: Guild, options: RunSetupOptions): Promise<SetupServiceResult> {
  const botMember = await getBotMember(guild);
  const existingSettings = findGuildSettingsByGuildId(guild.id);

  if (!botMember) {
    throw new SetupServiceError('BOT_MEMBER_UNAVAILABLE', 'Не удалось получить данные бота для этого сервера.');
  }

  const missingPermissions = getMissingPermissions(botMember);

  if (missingPermissions.length > 0) {
    throw new SetupServiceError(
      'MISSING_BOT_PERMISSIONS',
      `Мне не хватает обязательных прав: ${missingPermissions.join(', ')}`,
    );
  }

  const { category, categoryCreated } = await resolveSetupCategory(
    guild,
    options.category,
    existingSettings,
  );
  const { generator, generatorCreated } = await resolveSetupGenerator(
    guild,
    category,
    existingSettings,
  );

  const settings = upsertGuildSettings(
    toGuildSettingsInput(guild.id, category.id, generator.id, options, existingSettings),
  );

  return {
    settings,
    categoryCreated,
    generatorCreated,
  };
}
