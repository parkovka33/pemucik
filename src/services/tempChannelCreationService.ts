import type { Guild, GuildMember, VoiceChannel } from 'discord.js';

import {
  findTempChannelByChannelId,
  findTempChannelByOwner,
  insertTempChannel,
  type InsertTempChannelInput,
} from '../db/repositories/tempChannelsRepo';
import type { GuildSettings, TempChannelRecord } from '../types';
import {
  deleteTrackedTempChannelArtifacts,
  type TrackedArtifactCleanupResult,
} from './cleanupService';
import { createTempChannelForMember, moveMemberToChannel } from './tempChannelService';

const PERSISTENCE_ATTEMPTS = 3;
const PERSISTENCE_RETRY_DELAY_MS = 25;

export interface TempChannelCreationDependencies {
  createChannel: (member: GuildMember, settings: GuildSettings) => Promise<VoiceChannel>;
  moveMember: (member: GuildMember, channel: VoiceChannel) => Promise<void>;
  insertRecord: (input: InsertTempChannelInput) => void;
  findRecordByChannelId: (channelId: string) => TempChannelRecord | null;
  findRecordByOwner: (guildId: string, ownerUserId: string) => TempChannelRecord | null;
  cleanupArtifacts: (guild: Guild, channelId: string) => Promise<TrackedArtifactCleanupResult>;
  delay: (milliseconds: number) => Promise<void>;
}

export type TempChannelCreationResult =
  | {
      status: 'member_left_before_create';
    }
  | {
      status: 'created';
      channel: VoiceChannel;
    }
  | {
      status: 'compensated';
      channelId: string;
      reason: 'member_left_before_move' | 'member_move_failed';
      cause?: unknown;
    }
  | {
      status: 'compensation_retry_required';
      channelId: string;
      reason: 'member_left_before_move' | 'member_move_failed';
      stage: 'database_confirmation' | 'discord_delete' | 'artifact_cleanup';
      cause: unknown;
    }
  | {
      status: 'orphaned_untracked';
      channelId: string;
      cause: unknown;
      conflictingChannelId: string | null;
    };

const defaultDependencies: TempChannelCreationDependencies = {
  createChannel: createTempChannelForMember,
  moveMember: moveMemberToChannel,
  insertRecord: insertTempChannel,
  findRecordByChannelId: findTempChannelByChannelId,
  findRecordByOwner: findTempChannelByOwner,
  cleanupArtifacts: deleteTrackedTempChannelArtifacts,
  delay: (milliseconds) => new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  }),
};

function getSqliteErrorCode(error: unknown): string | null {
  if (typeof error !== 'object' || error === null || !('code' in error)) {
    return null;
  }

  return typeof error.code === 'string' ? error.code : null;
}

function isRetryablePersistenceError(error: unknown): boolean {
  const code = getSqliteErrorCode(error);

  return code !== null && (
    code.startsWith('SQLITE_BUSY')
    || code.startsWith('SQLITE_LOCKED')
    || code.startsWith('SQLITE_IOERR')
    || code === 'SQLITE_PROTOCOL'
  );
}

function isUnknownChannelError(error: unknown): error is { code: number } {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 10003;
}

function buildRecordInput(
  member: GuildMember,
  settings: GuildSettings,
  channel: VoiceChannel,
): InsertTempChannelInput {
  return {
    channelId: channel.id,
    guildId: member.guild.id,
    ownerUserId: member.id,
    categoryId: settings.categoryId,
    userLimit: channel.userLimit,
  };
}

function isExpectedRecord(
  record: TempChannelRecord | null,
  member: GuildMember,
  channel: VoiceChannel,
): record is TempChannelRecord {
  return record !== null
    && record.channelId === channel.id
    && record.guildId === member.guild.id
    && record.ownerUserId === member.id;
}

async function persistCreatedChannel(
  member: GuildMember,
  settings: GuildSettings,
  channel: VoiceChannel,
  dependencies: TempChannelCreationDependencies,
): Promise<{ confirmed: true } | { confirmed: false; cause: unknown; conflictingChannelId: string | null }> {
  let lastError: unknown = new Error('Temporary channel persistence was not attempted.');

  for (let attempt = 1; attempt <= PERSISTENCE_ATTEMPTS; attempt += 1) {
    try {
      dependencies.insertRecord(buildRecordInput(member, settings, channel));
      const record = dependencies.findRecordByChannelId(channel.id);

      if (!isExpectedRecord(record, member, channel)) {
        throw new Error('Temporary channel insert returned without the expected confirmed record.');
      }

      return { confirmed: true };
    } catch (error) {
      lastError = error;

      try {
        const committedRecord = dependencies.findRecordByChannelId(channel.id);

        if (isExpectedRecord(committedRecord, member, channel)) {
          return { confirmed: true };
        }
      } catch (confirmationError) {
        lastError = confirmationError;
      }

      if (!isRetryablePersistenceError(error) || attempt === PERSISTENCE_ATTEMPTS) {
        break;
      }

      await dependencies.delay(PERSISTENCE_RETRY_DELAY_MS);
    }
  }

  const conflictingRecord = dependencies.findRecordByOwner(member.guild.id, member.id);

  return {
    confirmed: false,
    cause: lastError,
    conflictingChannelId: conflictingRecord?.channelId ?? null,
  };
}

async function compensateTrackedCreation(
  member: GuildMember,
  channel: VoiceChannel,
  reason: 'member_left_before_move' | 'member_move_failed',
  cause: unknown,
  dependencies: TempChannelCreationDependencies,
): Promise<TempChannelCreationResult> {
  const record = dependencies.findRecordByChannelId(channel.id);

  if (!isExpectedRecord(record, member, channel)) {
    return {
      status: 'compensation_retry_required',
      channelId: channel.id,
      reason,
      stage: 'database_confirmation',
      cause: new Error('Compensation refused because the exact tracked channel record could not be confirmed.'),
    };
  }

  try {
    await channel.delete(
      reason === 'member_left_before_move'
        ? 'Pemucik: удаление отслеживаемой комнаты после выхода пользователя из генератора'
        : 'Pemucik: удаление отслеживаемой комнаты после неудачного переноса пользователя',
    );
  } catch (error) {
    if (!isUnknownChannelError(error)) {
      return {
        status: 'compensation_retry_required',
        channelId: channel.id,
        reason,
        stage: 'discord_delete',
        cause: error,
      };
    }
  }

  const cleanupResult = await dependencies.cleanupArtifacts(member.guild, channel.id);

  if (cleanupResult.status !== 'completed') {
    return {
      status: 'compensation_retry_required',
      channelId: channel.id,
      reason,
      stage: 'artifact_cleanup',
      cause: cleanupResult.status === 'retry_required'
        ? cleanupResult.error
        : new Error('Tracked channel record disappeared during compensation.'),
    };
  }

  const result: TempChannelCreationResult = {
    status: 'compensated',
    channelId: channel.id,
    reason,
  };

  if (cause !== undefined) {
    result.cause = cause;
  }

  return result;
}

export async function createTrackedTempChannelForMember(
  member: GuildMember,
  settings: GuildSettings,
  dependencies: TempChannelCreationDependencies = defaultDependencies,
): Promise<TempChannelCreationResult> {
  if (member.voice.channelId !== settings.generatorChannelId) {
    return { status: 'member_left_before_create' };
  }

  const channel = await dependencies.createChannel(member, settings);
  const persistenceResult = await persistCreatedChannel(member, settings, channel, dependencies);

  if (!persistenceResult.confirmed) {
    return {
      status: 'orphaned_untracked',
      channelId: channel.id,
      cause: persistenceResult.cause,
      conflictingChannelId: persistenceResult.conflictingChannelId,
    };
  }

  if (member.voice.channelId !== settings.generatorChannelId) {
    return compensateTrackedCreation(
      member,
      channel,
      'member_left_before_move',
      undefined,
      dependencies,
    );
  }

  try {
    await dependencies.moveMember(member, channel);
  } catch (error) {
    return compensateTrackedCreation(
      member,
      channel,
      'member_move_failed',
      error,
      dependencies,
    );
  }

  return {
    status: 'created',
    channel,
  };
}
