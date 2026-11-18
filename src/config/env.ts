import { existsSync } from 'node:fs';

import { config as loadDotEnv } from 'dotenv';

import {
  DEFAULT_DATABASE_PATH,
  DEFAULT_LOG_LEVEL,
  DEFAULT_NODE_ENV,
  LEGACY_DATABASE_PATH,
} from './constants';
import type { AppEnv, LogLevel, NodeEnvironment } from '../types';

loadDotEnv();

const VALID_LOG_LEVELS: readonly LogLevel[] = ['debug', 'info', 'warn', 'error'];
const VALID_NODE_ENVS: readonly NodeEnvironment[] = ['development', 'production', 'test'];

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

function optionalEnv(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value ? value : undefined;
}

function parseLogLevel(raw: string | undefined): LogLevel {
  const value = raw?.trim().toLowerCase() ?? DEFAULT_LOG_LEVEL;

  if (VALID_LOG_LEVELS.includes(value as LogLevel)) {
    return value as LogLevel;
  }

  throw new Error(`Invalid LOG_LEVEL value: ${raw}`);
}

function parseNodeEnv(raw: string | undefined): NodeEnvironment {
  const value = raw?.trim().toLowerCase() ?? DEFAULT_NODE_ENV;

  if (VALID_NODE_ENVS.includes(value as NodeEnvironment)) {
    return value as NodeEnvironment;
  }

  throw new Error(`Invalid NODE_ENV value: ${raw}`);
}

export function getDatabasePath(): string {
  const configuredPath = optionalEnv('DATABASE_PATH');

  if (configuredPath) {
    return configuredPath;
  }

  if (!existsSync(DEFAULT_DATABASE_PATH) && existsSync(LEGACY_DATABASE_PATH)) {
    return LEGACY_DATABASE_PATH;
  }

  return DEFAULT_DATABASE_PATH;
}

export function getEnv(): AppEnv {
  const env: AppEnv = {
    discordToken: requireEnv('DISCORD_TOKEN'),
    discordClientId: requireEnv('DISCORD_CLIENT_ID'),
    databasePath: getDatabasePath(),
    logLevel: parseLogLevel(process.env.LOG_LEVEL),
    nodeEnv: parseNodeEnv(process.env.NODE_ENV),
  };

  const discordGuildId = optionalEnv('DISCORD_GUILD_ID');
  const supportServerUrl = optionalEnv('SUPPORT_SERVER_URL');
  const donationUrl = optionalEnv('DONATION_URL');

  if (discordGuildId) {
    env.discordGuildId = discordGuildId;
  }

  if (supportServerUrl) {
    env.supportServerUrl = supportServerUrl;
  }

  if (donationUrl) {
    env.donationUrl = donationUrl;
  }

  return env;
}
