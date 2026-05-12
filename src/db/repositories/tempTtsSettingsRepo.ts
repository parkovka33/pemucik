import { getDatabase } from '../database';

import type { TempTtsSettingsRecord } from '../../types';

interface TempTtsSettingsRow {
  voice_channel_id: string;
  guild_id: string;
  enabled: number;
  voice_key: string;
  created_at: string;
  updated_at: string;
}

export interface UpsertTempTtsSettingsInput {
  voiceChannelId: string;
  guildId: string;
  enabled?: boolean;
  voiceKey?: string;
}

const DEFAULT_TEMP_TTS_VOICE_KEY = 'default';

function mapTempTtsSettingsRow(row: TempTtsSettingsRow): TempTtsSettingsRecord {
  return {
    voiceChannelId: row.voice_channel_id,
    guildId: row.guild_id,
    enabled: row.enabled === 1,
    voiceKey: row.voice_key,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function findTempTtsSettingsByVoiceChannelId(voiceChannelId: string): TempTtsSettingsRecord | null {
  const database = getDatabase();
  const row = database
    .prepare(
      `SELECT
        voice_channel_id,
        guild_id,
        enabled,
        voice_key,
        created_at,
        updated_at
      FROM temp_tts_settings
      WHERE voice_channel_id = ?`,
    )
    .get(voiceChannelId) as TempTtsSettingsRow | undefined;

  return row ? mapTempTtsSettingsRow(row) : null;
}

export function listTempTtsSettingsByGuildId(guildId: string): TempTtsSettingsRecord[] {
  const database = getDatabase();
  const rows = database
    .prepare(
      `SELECT
        voice_channel_id,
        guild_id,
        enabled,
        voice_key,
        created_at,
        updated_at
      FROM temp_tts_settings
      WHERE guild_id = ?
      ORDER BY voice_channel_id ASC`,
    )
    .all(guildId) as TempTtsSettingsRow[];

  return rows.map(mapTempTtsSettingsRow);
}

export function upsertTempTtsSettings(input: UpsertTempTtsSettingsInput): TempTtsSettingsRecord {
  const database = getDatabase();

  database.prepare(
    `INSERT INTO temp_tts_settings (
      voice_channel_id,
      guild_id,
      enabled,
      voice_key
    ) VALUES (
      @voiceChannelId,
      @guildId,
      @enabled,
      @voiceKey
    )
    ON CONFLICT(voice_channel_id) DO UPDATE SET
      guild_id = excluded.guild_id,
      enabled = excluded.enabled,
      voice_key = excluded.voice_key,
      updated_at = CURRENT_TIMESTAMP`,
  ).run({
    ...input,
    enabled: input.enabled ? 1 : 0,
    voiceKey: input.voiceKey ?? DEFAULT_TEMP_TTS_VOICE_KEY,
  });

  const record = findTempTtsSettingsByVoiceChannelId(input.voiceChannelId);

  if (!record) {
    throw new Error('Failed to load temp TTS settings after upsert.');
  }

  return record;
}

export function updateTempTtsEnabled(voiceChannelId: string, enabled: boolean): TempTtsSettingsRecord {
  const database = getDatabase();

  database.prepare(
    `UPDATE temp_tts_settings
    SET enabled = ?, updated_at = CURRENT_TIMESTAMP
    WHERE voice_channel_id = ?`,
  ).run(enabled ? 1 : 0, voiceChannelId);

  const record = findTempTtsSettingsByVoiceChannelId(voiceChannelId);

  if (!record) {
    throw new Error('Failed to load temp TTS settings after enabled update.');
  }

  return record;
}

export function updateTempTtsVoiceKey(voiceChannelId: string, voiceKey: string): TempTtsSettingsRecord {
  const database = getDatabase();

  database.prepare(
    `UPDATE temp_tts_settings
    SET voice_key = ?, updated_at = CURRENT_TIMESTAMP
    WHERE voice_channel_id = ?`,
  ).run(voiceKey, voiceChannelId);

  const record = findTempTtsSettingsByVoiceChannelId(voiceChannelId);

  if (!record) {
    throw new Error('Failed to load temp TTS settings after voice key update.');
  }

  return record;
}

export function deleteTempTtsSettingsByVoiceChannelId(voiceChannelId: string): void {
  const database = getDatabase();

  database.prepare('DELETE FROM temp_tts_settings WHERE voice_channel_id = ?').run(voiceChannelId);
}
