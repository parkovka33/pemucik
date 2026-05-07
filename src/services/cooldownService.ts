import {
  CREATE_TEMP_CHANNEL_COOLDOWN_SECONDS,
  RENAME_TEMP_CHANNEL_COOLDOWN_SECONDS,
} from '../config/constants';
import {
  deleteUserCooldown,
  findUserCooldown,
  upsertUserCooldown,
} from '../db/repositories/userCooldownsRepo';

import type { CooldownAction } from '../types';

const CREATE_TEMP_CHANNEL_ACTION: CooldownAction = 'create_temp_channel';
const RENAME_TEMP_CHANNEL_ACTION: CooldownAction = 'rename_temp_channel';

function getRemainingCooldownMilliseconds(expiresAt: string): number {
  return new Date(expiresAt).getTime() - Date.now();
}

export function getCreateCooldownRemainingSeconds(guildId: string, userId: string): number {
  const cooldown = findUserCooldown(guildId, userId, CREATE_TEMP_CHANNEL_ACTION);

  if (!cooldown) {
    return 0;
  }

  const remainingMilliseconds = getRemainingCooldownMilliseconds(cooldown.expiresAt);

  if (remainingMilliseconds <= 0) {
    deleteUserCooldown(guildId, userId, CREATE_TEMP_CHANNEL_ACTION);
    return 0;
  }

  return Math.ceil(remainingMilliseconds / 1000);
}

export function startCreateCooldown(guildId: string, userId: string): void {
  const expiresAt = new Date(
    Date.now() + CREATE_TEMP_CHANNEL_COOLDOWN_SECONDS * 1000,
  ).toISOString();

  upsertUserCooldown(guildId, userId, CREATE_TEMP_CHANNEL_ACTION, expiresAt);
}

export function clearCreateCooldown(guildId: string, userId: string): void {
  deleteUserCooldown(guildId, userId, CREATE_TEMP_CHANNEL_ACTION);
}

export function getRenameCooldownRemainingSeconds(guildId: string, userId: string): number {
  const cooldown = findUserCooldown(guildId, userId, RENAME_TEMP_CHANNEL_ACTION);

  if (!cooldown) {
    return 0;
  }

  const remainingMilliseconds = getRemainingCooldownMilliseconds(cooldown.expiresAt);

  if (remainingMilliseconds <= 0) {
    deleteUserCooldown(guildId, userId, RENAME_TEMP_CHANNEL_ACTION);
    return 0;
  }

  return Math.ceil(remainingMilliseconds / 1000);
}

export function startRenameCooldown(guildId: string, userId: string): void {
  const expiresAt = new Date(
    Date.now() + RENAME_TEMP_CHANNEL_COOLDOWN_SECONDS * 1000,
  ).toISOString();

  upsertUserCooldown(guildId, userId, RENAME_TEMP_CHANNEL_ACTION, expiresAt);
}
