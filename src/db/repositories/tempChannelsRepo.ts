import { getDatabase } from '../database';

import type { TempChannelRecord } from '../../types';

interface TempChannelRow {
  channel_id: string;
  guild_id: string;
  owner_user_id: string;
  category_id: string;
  created_at: string;
  last_active_at: string;
  is_locked: number;
  user_limit: number;
}

export interface InsertTempChannelInput {
  channelId: string;
  guildId: string;
  ownerUserId: string;
  categoryId: string;
  isLocked?: boolean;
  userLimit?: number;
}

function mapTempChannelRow(row: TempChannelRow): TempChannelRecord {
  return {
    channelId: row.channel_id,
    guildId: row.guild_id,
    ownerUserId: row.owner_user_id,
    categoryId: row.category_id,
    createdAt: row.created_at,
    lastActiveAt: row.last_active_at,
    isLocked: row.is_locked === 1,
    userLimit: row.user_limit,
  };
}

export function findTempChannelByChannelId(channelId: string): TempChannelRecord | null {
  const database = getDatabase();
  const row = database
    .prepare(
      `SELECT
        channel_id,
        guild_id,
        owner_user_id,
        category_id,
        created_at,
        last_active_at,
        is_locked,
        user_limit
      FROM temp_channels
      WHERE channel_id = ?`,
    )
    .get(channelId) as TempChannelRow | undefined;

  return row ? mapTempChannelRow(row) : null;
}

export function findTempChannelByOwner(guildId: string, ownerUserId: string): TempChannelRecord | null {
  const database = getDatabase();
  const row = database
    .prepare(
      `SELECT
        channel_id,
        guild_id,
        owner_user_id,
        category_id,
        created_at,
        last_active_at,
        is_locked,
        user_limit
      FROM temp_channels
      WHERE guild_id = ? AND owner_user_id = ?`,
    )
    .get(guildId, ownerUserId) as TempChannelRow | undefined;

  return row ? mapTempChannelRow(row) : null;
}

export function listTempChannelsByGuildId(guildId: string): TempChannelRecord[] {
  const database = getDatabase();
  const rows = database
    .prepare(
      `SELECT
        channel_id,
        guild_id,
        owner_user_id,
        category_id,
        created_at,
        last_active_at,
        is_locked,
        user_limit
      FROM temp_channels
      WHERE guild_id = ?`,
    )
    .all(guildId) as TempChannelRow[];

  return rows.map(mapTempChannelRow);
}

export function countTempChannelsByGuildId(guildId: string): number {
  const database = getDatabase();
  const row = database
    .prepare('SELECT COUNT(*) AS count FROM temp_channels WHERE guild_id = ?')
    .get(guildId) as { count: number };

  return row.count;
}

export function insertTempChannel(input: InsertTempChannelInput): void {
  const database = getDatabase();

  database.prepare(
    `INSERT INTO temp_channels (
      channel_id,
      guild_id,
      owner_user_id,
      category_id,
      is_locked,
      user_limit
    ) VALUES (
      @channelId,
      @guildId,
      @ownerUserId,
      @categoryId,
      @isLocked,
      @userLimit
    )`,
  ).run({
    ...input,
    isLocked: input.isLocked ? 1 : 0,
    userLimit: input.userLimit ?? 0,
  });
}

export function updateTempChannelLockState(channelId: string, isLocked: boolean): void {
  const database = getDatabase();

  database.prepare(
    `UPDATE temp_channels
    SET is_locked = ?, last_active_at = CURRENT_TIMESTAMP
    WHERE channel_id = ?`,
  ).run(isLocked ? 1 : 0, channelId);
}

export function updateTempChannelUserLimit(channelId: string, userLimit: number): void {
  const database = getDatabase();

  database.prepare(
    `UPDATE temp_channels
    SET user_limit = ?, last_active_at = CURRENT_TIMESTAMP
    WHERE channel_id = ?`,
  ).run(userLimit, channelId);
}

export function updateTempChannelOwner(channelId: string, ownerUserId: string): void {
  const database = getDatabase();

  database.prepare(
    `UPDATE temp_channels
    SET owner_user_id = ?, last_active_at = CURRENT_TIMESTAMP
    WHERE channel_id = ?`,
  ).run(ownerUserId, channelId);
}

export function deleteTempChannelByChannelId(channelId: string): void {
  const database = getDatabase();

  database.prepare('DELETE FROM temp_channels WHERE channel_id = ?').run(channelId);
}
