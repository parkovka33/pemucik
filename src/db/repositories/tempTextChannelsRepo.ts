import { getDatabase } from '../database';

import type { TempTextChannelRecord } from '../../types';

interface TempTextChannelRow {
  text_channel_id: string;
  voice_channel_id: string;
  guild_id: string;
  created_at: string;
  updated_at: string;
}

export interface UpsertTempTextChannelInput {
  textChannelId: string;
  voiceChannelId: string;
  guildId: string;
}

function mapTempTextChannelRow(row: TempTextChannelRow): TempTextChannelRecord {
  return {
    textChannelId: row.text_channel_id,
    voiceChannelId: row.voice_channel_id,
    guildId: row.guild_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function findTempTextChannelByVoiceChannelId(voiceChannelId: string): TempTextChannelRecord | null {
  const database = getDatabase();
  const row = database
    .prepare(
      `SELECT
        text_channel_id,
        voice_channel_id,
        guild_id,
        created_at,
        updated_at
      FROM temp_text_channels
      WHERE voice_channel_id = ?`,
    )
    .get(voiceChannelId) as TempTextChannelRow | undefined;

  return row ? mapTempTextChannelRow(row) : null;
}

export function findTempTextChannelByTextChannelId(textChannelId: string): TempTextChannelRecord | null {
  const database = getDatabase();
  const row = database
    .prepare(
      `SELECT
        text_channel_id,
        voice_channel_id,
        guild_id,
        created_at,
        updated_at
      FROM temp_text_channels
      WHERE text_channel_id = ?`,
    )
    .get(textChannelId) as TempTextChannelRow | undefined;

  return row ? mapTempTextChannelRow(row) : null;
}

export function upsertTempTextChannel(input: UpsertTempTextChannelInput): TempTextChannelRecord {
  const database = getDatabase();

  database.prepare(
    `INSERT INTO temp_text_channels (
      text_channel_id,
      voice_channel_id,
      guild_id
    ) VALUES (
      @textChannelId,
      @voiceChannelId,
      @guildId
    )
    ON CONFLICT(voice_channel_id) DO UPDATE SET
      text_channel_id = excluded.text_channel_id,
      guild_id = excluded.guild_id,
      updated_at = CURRENT_TIMESTAMP`,
  ).run(input);

  const record = findTempTextChannelByVoiceChannelId(input.voiceChannelId);

  if (!record) {
    throw new Error('Failed to load temp text channel after upsert.');
  }

  return record;
}

export function deleteTempTextChannelByVoiceChannelId(voiceChannelId: string): void {
  const database = getDatabase();

  database.prepare('DELETE FROM temp_text_channels WHERE voice_channel_id = ?').run(voiceChannelId);
}

export function deleteTempTextChannelByTextChannelId(textChannelId: string): void {
  const database = getDatabase();

  database.prepare('DELETE FROM temp_text_channels WHERE text_channel_id = ?').run(textChannelId);
}
