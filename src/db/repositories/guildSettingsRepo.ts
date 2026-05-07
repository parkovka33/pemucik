import { getDatabase } from '../database';

import type { GuildSettings, TempChannelPermissionSource } from '../../types';

interface GuildSettingsRow {
  guild_id: string;
  category_id: string;
  generator_channel_id: string;
  editable_by_owner: number;
  permission_source: string;
  default_name_template: string;
  default_user_limit: number;
  default_bitrate: number;
  language: string;
  max_temp_channels: number;
  interface_channel_id: string | null;
  interface_message_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface UpsertGuildSettingsInput {
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
  interfaceChannelId?: string | null;
  interfaceMessageId?: string | null;
}

function mapGuildSettingsRow(row: GuildSettingsRow): GuildSettings {
  return {
    guildId: row.guild_id,
    categoryId: row.category_id,
    generatorChannelId: row.generator_channel_id,
    editableByOwner: row.editable_by_owner === 1,
    permissionSource: row.permission_source === 'generator' ? 'generator' : 'category',
    defaultNameTemplate: row.default_name_template,
    defaultUserLimit: row.default_user_limit,
    defaultBitrate: row.default_bitrate,
    language: row.language,
    maxTempChannels: row.max_temp_channels,
    interfaceChannelId: row.interface_channel_id,
    interfaceMessageId: row.interface_message_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function findGuildSettingsByGuildId(guildId: string): GuildSettings | null {
  const database = getDatabase();
  const row = database
    .prepare(
      `SELECT
        guild_id,
        category_id,
        generator_channel_id,
        editable_by_owner,
        permission_source,
        default_name_template,
        default_user_limit,
        default_bitrate,
        language,
        max_temp_channels,
        interface_channel_id,
        interface_message_id,
        created_at,
        updated_at
      FROM guild_settings
      WHERE guild_id = ?`,
    )
    .get(guildId) as GuildSettingsRow | undefined;

  return row ? mapGuildSettingsRow(row) : null;
}

export function listGuildSettingsWithInterface(): GuildSettings[] {
  const database = getDatabase();
  const rows = database
    .prepare(
      `SELECT
        guild_id,
        category_id,
        generator_channel_id,
        editable_by_owner,
        permission_source,
        default_name_template,
        default_user_limit,
        default_bitrate,
        language,
        max_temp_channels,
        interface_channel_id,
        interface_message_id,
        created_at,
        updated_at
      FROM guild_settings
      WHERE interface_channel_id IS NOT NULL OR interface_message_id IS NOT NULL`,
    )
    .all() as GuildSettingsRow[];

  return rows.map(mapGuildSettingsRow);
}

export function upsertGuildSettings(input: UpsertGuildSettingsInput): GuildSettings {
  const database = getDatabase();

  database.prepare(
    `INSERT INTO guild_settings (
      guild_id,
      category_id,
      generator_channel_id,
      editable_by_owner,
      permission_source,
      default_name_template,
      default_user_limit,
      default_bitrate,
      language,
      max_temp_channels,
      interface_channel_id,
      interface_message_id
    ) VALUES (
      @guildId,
      @categoryId,
      @generatorChannelId,
      @editableByOwner,
      @permissionSource,
      @defaultNameTemplate,
      @defaultUserLimit,
      @defaultBitrate,
      @language,
      @maxTempChannels,
      @interfaceChannelId,
      @interfaceMessageId
    )
    ON CONFLICT(guild_id) DO UPDATE SET
      category_id = excluded.category_id,
      generator_channel_id = excluded.generator_channel_id,
      editable_by_owner = excluded.editable_by_owner,
      permission_source = excluded.permission_source,
      default_name_template = excluded.default_name_template,
      default_user_limit = excluded.default_user_limit,
      default_bitrate = excluded.default_bitrate,
      language = excluded.language,
      max_temp_channels = excluded.max_temp_channels,
      interface_channel_id = excluded.interface_channel_id,
      interface_message_id = excluded.interface_message_id,
      updated_at = CURRENT_TIMESTAMP`,
  ).run({
    ...input,
    editableByOwner: input.editableByOwner ? 1 : 0,
    interfaceChannelId: input.interfaceChannelId ?? null,
    interfaceMessageId: input.interfaceMessageId ?? null,
  });

  const settings = findGuildSettingsByGuildId(input.guildId);

  if (!settings) {
    throw new Error('Failed to load guild settings after upsert.');
  }

  return settings;
}

export function updateGuildDefaultBitrate(guildId: string, defaultBitrate: number): GuildSettings {
  const database = getDatabase();

  database.prepare(
    `UPDATE guild_settings
    SET default_bitrate = ?, updated_at = CURRENT_TIMESTAMP
    WHERE guild_id = ?`,
  ).run(defaultBitrate, guildId);

  const settings = findGuildSettingsByGuildId(guildId);

  if (!settings) {
    throw new Error('Failed to load guild settings after bitrate update.');
  }

  return settings;
}

export function updateGuildInterfaceMetadata(
  guildId: string,
  interfaceChannelId: string | null,
  interfaceMessageId: string | null,
): GuildSettings {
  const database = getDatabase();

  database.prepare(
    `UPDATE guild_settings
    SET interface_channel_id = ?,
        interface_message_id = ?,
        updated_at = CURRENT_TIMESTAMP
    WHERE guild_id = ?`,
  ).run(interfaceChannelId, interfaceMessageId, guildId);

  const settings = findGuildSettingsByGuildId(guildId);

  if (!settings) {
    throw new Error('Failed to load guild settings after interface update.');
  }

  return settings;
}
