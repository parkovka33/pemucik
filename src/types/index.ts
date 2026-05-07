import type {
  AutocompleteInteraction,
  ChatInputCommandInteraction,
  SlashCommandBuilder,
  SlashCommandOptionsOnlyBuilder,
  SlashCommandSubcommandsOnlyBuilder,
} from 'discord.js';

import type { Logger } from '../utils/logger';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';
export type NodeEnvironment = 'development' | 'production' | 'test';
export type LogValue = string | number | boolean | undefined;
export type LogFields = Record<string, LogValue>;
export type CooldownAction = 'create_temp_channel' | 'rename_temp_channel';
export type TempChannelPermissionSource = 'category' | 'generator';
export type MetricCounterKey =
  | 'channels_created'
  | 'creation_failed'
  | 'channels_deleted'
  | 'rename_used'
  | 'lock_used'
  | 'unlock_used'
  | 'limit_used';

export interface AppEnv {
  discordToken: string;
  discordClientId: string;
  discordGuildId?: string;
  databasePath: string;
  logLevel: LogLevel;
  nodeEnv: NodeEnvironment;
  supportServerUrl?: string;
  donationUrl?: string;
}

export interface LoggerPayload {
  level: LogLevel;
  event: string;
  message?: string;
  error?: string;
  stack?: string;
  [key: string]: LogValue;
}

export interface GuildSettings {
  guildId: string;
  categoryId: string;
  generatorChannelId: string;
  editableByOwner: boolean;
  permissionSource: TempChannelPermissionSource;
  defaultNameTemplate: string;
  defaultUserLimit: number;
  defaultBitrate: number;
  language: string;
  maxTempChannels: number;
  interfaceChannelId: string | null;
  interfaceMessageId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface TempChannelRecord {
  channelId: string;
  guildId: string;
  ownerUserId: string;
  categoryId: string;
  createdAt: string;
  lastActiveAt: string;
  isLocked: boolean;
  userLimit: number;
}

export interface TempTextChannelRecord {
  textChannelId: string;
  voiceChannelId: string;
  guildId: string;
  createdAt: string;
  updatedAt: string;
}

export interface UserCooldownRecord {
  guildId: string;
  userId: string;
  action: CooldownAction;
  expiresAt: string;
}

export interface CommandExecutionContext {
  logger: Logger;
}

export interface AppCommand {
  data: SlashCommandBuilder | SlashCommandOptionsOnlyBuilder | SlashCommandSubcommandsOnlyBuilder;
  autocomplete?: (
    interaction: AutocompleteInteraction,
    context: CommandExecutionContext,
  ) => Promise<void>;
  execute: (
    interaction: ChatInputCommandInteraction,
    context: CommandExecutionContext,
  ) => Promise<void>;
}
