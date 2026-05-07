import { getDatabase } from '../database';

import type { CooldownAction, UserCooldownRecord } from '../../types';

interface UserCooldownRow {
  guild_id: string;
  user_id: string;
  action: string;
  expires_at: string;
}

function mapUserCooldownRow(row: UserCooldownRow): UserCooldownRecord {
  return {
    guildId: row.guild_id,
    userId: row.user_id,
    action: row.action as CooldownAction,
    expiresAt: row.expires_at,
  };
}

export function findUserCooldown(
  guildId: string,
  userId: string,
  action: CooldownAction,
): UserCooldownRecord | null {
  const database = getDatabase();
  const row = database
    .prepare(
      `SELECT guild_id, user_id, action, expires_at
      FROM user_cooldowns
      WHERE guild_id = ? AND user_id = ? AND action = ?`,
    )
    .get(guildId, userId, action) as UserCooldownRow | undefined;

  return row ? mapUserCooldownRow(row) : null;
}

export function upsertUserCooldown(
  guildId: string,
  userId: string,
  action: CooldownAction,
  expiresAt: string,
): void {
  const database = getDatabase();

  database.prepare(
    `INSERT INTO user_cooldowns (guild_id, user_id, action, expires_at)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(guild_id, user_id, action) DO UPDATE SET
      expires_at = excluded.expires_at`,
  ).run(guildId, userId, action, expiresAt);
}

export function deleteUserCooldown(
  guildId: string,
  userId: string,
  action: CooldownAction,
): void {
  const database = getDatabase();

  database
    .prepare('DELETE FROM user_cooldowns WHERE guild_id = ? AND user_id = ? AND action = ?')
    .run(guildId, userId, action);
}
