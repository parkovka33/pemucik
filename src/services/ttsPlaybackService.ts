import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { access, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  AudioPlayerStatus,
  NoSubscriberBehavior,
  VoiceConnectionStatus,
  createAudioPlayer,
  createAudioResource,
  entersState,
  generateDependencyReport,
  joinVoiceChannel,
  type DiscordGatewayAdapterCreator,
  type VoiceConnection,
} from '@discordjs/voice';
import {
  ChannelType,
  PermissionFlagsBits,
  type Guild,
  type VoiceChannel,
} from 'discord.js';

import {
  TEMP_TTS_CONNECTION_READY_TIMEOUT_MS,
  TEMP_TTS_GUILD_QUEUE_LIMIT,
  TEMP_TTS_PLAYBACK_IDLE_DISCONNECT_MS,
  TEMP_TTS_PLAYBACK_QUEUE_LIMIT,
  TEMP_TTS_PLAYBACK_TIMEOUT_MS,
  TEMP_TTS_SYNTHESIS_TIMEOUT_MS,
} from '../config/constants';
import type { Logger } from '../utils/logger';
import { findTempTtsVoicePreset } from './ttsControlService';
import type { AcceptedTempTtsMessage } from './ttsIntakeService';

export interface QueuedTempTtsPlaybackJob extends AcceptedTempTtsMessage {
  queuedAt: number;
}

export interface TempTtsRoomQueue {
  voiceChannelId: string;
  jobs: QueuedTempTtsPlaybackJob[];
}

interface TempTtsGuildPlaybackState {
  guildId: string;
  roomQueues: Map<string, TempTtsRoomQueue>;
  connection: VoiceConnection | null;
  connectedChannelId: string | null;
  disconnectTimer: NodeJS.Timeout | null;
  processing: boolean;
  player: ReturnType<typeof createAudioPlayer>;
  activeVoiceChannelId: string | null;
  activeAbortController: AbortController | null;
}

export interface TempTtsPiperRuntimeConfig {
  command: string;
  modelEnvVarName: string;
  modelPath: string;
}

export interface TempTtsPlaybackStateSummary {
  queuedVoiceChannelIds: string[];
  connectedChannelId: string | null;
  processing: boolean;
}

interface SeedTempTtsPlaybackStateForTestsInput {
  guildId: string;
  queuedVoiceChannelIds?: string[];
  connectedChannelId?: string | null;
  processing?: boolean;
  onDestroyConnection?: () => void;
}

interface FetchedPlayableVoiceChannel {
  status: 'ok';
  channel: VoiceChannel;
}

interface SkippedPlayableVoiceChannel {
  status: 'skipped';
  reason:
    | 'voice_channel_missing'
    | 'voice_channel_invalid'
    | 'voice_channel_empty'
    | 'bot_missing_permissions';
  missingPermissions?: BotVoicePermissionName[];
}

type BotVoicePermissionName = 'ViewChannel' | 'Connect' | 'Speak';
type TempTtsPlaybackStage =
  | 'piper_synthesis'
  | 'voice_connection_ready'
  | 'audio_player_playing'
  | 'audio_player_idle';

const REQUIRED_BOT_VOICE_PERMISSIONS = [
  'ViewChannel',
  'Connect',
  'Speak',
] as const satisfies readonly BotVoicePermissionName[];
const TEMP_TTS_CONNECTION_READY_MAX_ATTEMPTS = 3;

interface TempTtsPlaybackStageErrorDetails {
  connectionStatus?: VoiceConnectionStatus;
  attempts?: number;
}

class TempTtsPlaybackStageError extends Error {
  public constructor(
    public readonly stage: TempTtsPlaybackStage,
    message: string,
    public readonly details: TempTtsPlaybackStageErrorDetails = {},
  ) {
    super(message);
    this.name = 'TempTtsPlaybackStageError';
  }
}

class TempTtsPlaybackCancelledError extends Error {
  public constructor() {
    super(
      'TTS playback was cancelled because the room was disabled, deleted, or shut down.',
    );
    this.name = 'TempTtsPlaybackCancelledError';
  }
}

const guildPlaybackStates = new Map<string, TempTtsGuildPlaybackState>();
const debuggedVoiceConnections = new WeakSet<VoiceConnection>();

function readOptionalEnv(
  name: string,
  env: NodeJS.ProcessEnv = process.env,
): string | null {
  const value = env[name]?.trim();
  return value && value.length > 0 ? value : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function readNestedString(
  record: Record<string, unknown>,
  ...path: string[]
): string | undefined {
  let current: unknown = record;

  for (const segment of path) {
    if (!isRecord(current) || !(segment in current)) {
      return undefined;
    }

    current = current[segment];
  }

  return typeof current === 'string' ? current : undefined;
}

function readNestedNumber(
  record: Record<string, unknown>,
  ...path: string[]
): number | undefined {
  let current: unknown = record;

  for (const segment of path) {
    if (!isRecord(current) || !(segment in current)) {
      return undefined;
    }

    current = current[segment];
  }

  return typeof current === 'number' ? current : undefined;
}

function readNestedBoolean(
  record: Record<string, unknown>,
  ...path: string[]
): boolean | undefined {
  let current: unknown = record;

  for (const segment of path) {
    if (!isRecord(current) || !(segment in current)) {
      return undefined;
    }

    current = current[segment];
  }

  return typeof current === 'boolean' ? current : undefined;
}

function summarizeVoiceConnectionState(
  connection: VoiceConnection,
): Record<string, string | number | boolean | undefined> {
  const stateRecord = connection.state as unknown;

  if (!isRecord(stateRecord)) {
    return {
      connectionStatus: connection.state.status,
    };
  }

  return {
    connectionStatus: connection.state.status,
    networkingCode: readNestedNumber(
      stateRecord,
      'networking',
      'state',
      'code',
    ),
    networkingWs: readNestedBoolean(stateRecord, 'networking', 'state', 'ws'),
    networkingUdp: readNestedBoolean(stateRecord, 'networking', 'state', 'udp'),
    endpoint: readNestedString(
      stateRecord,
      'networking',
      'state',
      'connectionOptions',
      'endpoint',
    ),
  };
}

function attachVoiceConnectionDebugListeners(
  connection: VoiceConnection,
  logger: Logger,
  guildId: string,
  voiceChannelId: string,
  attemptNumber: number,
): void {
  if (debuggedVoiceConnections.has(connection)) {
    return;
  }

  debuggedVoiceConnections.add(connection);

  connection.on('stateChange', (oldState, newState) => {
    logger.info({
      event: 'voice_tts_connection_state_change',
      guildId,
      voiceChannelId,
      attemptNumber,
      oldStatus: oldState.status,
      newStatus: newState.status,
      ...summarizeVoiceConnectionState(connection),
    });
  });

  connection.on(VoiceConnectionStatus.Disconnected, () => {
    logger.warn({
      event: 'voice_tts_connection_disconnected',
      guildId,
      voiceChannelId,
      attemptNumber,
      ...summarizeVoiceConnectionState(connection),
    });
  });

  connection.on('error', (error) => {
    logger.error(
      {
        event: 'voice_tts_connection_error',
        guildId,
        voiceChannelId,
        attemptNumber,
        ...summarizeVoiceConnectionState(connection),
      },
      error,
    );
  });
}

export function shouldRetryTempTtsVoiceConnectionReady(
  status: VoiceConnectionStatus,
  attemptNumber: number,
  maxAttempts = TEMP_TTS_CONNECTION_READY_MAX_ATTEMPTS,
): boolean {
  if (attemptNumber >= maxAttempts) {
    return false;
  }

  return (
    status === VoiceConnectionStatus.Signalling ||
    status === VoiceConnectionStatus.Connecting ||
    status === VoiceConnectionStatus.Disconnected
  );
}

export function resolveTempTtsPiperRuntimeConfig(
  voiceKey: string,
  env: NodeJS.ProcessEnv = process.env,
): TempTtsPiperRuntimeConfig | null {
  const preset = findTempTtsVoicePreset(voiceKey);

  if (!preset) {
    return null;
  }

  const modelPath = readOptionalEnv(preset.modelEnvVarName, env);

  if (!modelPath) {
    return null;
  }

  return {
    command: readOptionalEnv('PIPER_COMMAND', env) ?? 'piper',
    modelEnvVarName: preset.modelEnvVarName,
    modelPath,
  };
}

export function findTempTtsMediaDependencyProblems(
  dependencyReport = generateDependencyReport(),
): string[] {
  const problems: string[] = [];

  if (/FFmpeg\s*\r?\n- not found/i.test(dependencyReport)) {
    problems.push('FFmpeg is not available on PATH.');
  }

  const hasOpus =
    !/- @discordjs\/opus: not found[\s\S]*- opusscript: not found/i.test(
      dependencyReport,
    );

  if (!hasOpus) {
    problems.push('No supported Opus encoder is installed.');
  }

  return problems;
}

async function probeExecutable(
  command: string,
  args: string[],
  timeoutMs = 5_000,
): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    const child = spawn(command, args, {
      stdio: 'ignore',
      windowsHide: true,
    });
    let settled = false;

    const finish = (available: boolean): void => {
      if (settled) {
        return;
      }

      settled = true;
      clearTimeout(timeout);
      resolve(available);
    };
    const timeout = setTimeout(() => {
      child.kill();
      finish(false);
    }, timeoutMs);

    child.once('error', () => finish(false));
    child.once('close', (code) => finish(code === 0));
  });
}

export interface TempTtsRuntimeInspection {
  available: boolean;
  config: TempTtsPiperRuntimeConfig | null;
  problems: string[];
}

export async function inspectTempTtsRuntime(
  voiceKey: string,
  env: NodeJS.ProcessEnv = process.env,
): Promise<TempTtsRuntimeInspection> {
  const config = resolveTempTtsPiperRuntimeConfig(voiceKey, env);
  const problems = findTempTtsMediaDependencyProblems();

  if (!config) {
    const preset = findTempTtsVoicePreset(voiceKey);
    problems.push(
      preset
        ? `${preset.modelEnvVarName} is not configured.`
        : `Unknown TTS voice preset: ${voiceKey}.`,
    );
    return { available: false, config: null, problems };
  }

  try {
    await access(config.modelPath);
  } catch {
    problems.push(
      `${config.modelEnvVarName} does not point to a readable model file.`,
    );
  }

  if (!(await probeExecutable(config.command, ['--help']))) {
    problems.push(
      'The Piper executable is unavailable or failed its startup check.',
    );
  }

  return {
    available: problems.length === 0,
    config,
    problems,
  };
}

export function pickNextTempTtsRoomQueue(
  roomQueues: ReadonlyMap<string, TempTtsRoomQueue>,
): TempTtsRoomQueue | null {
  let selectedQueue: TempTtsRoomQueue | null = null;
  let oldestQueuedAt = Number.POSITIVE_INFINITY;

  for (const queue of roomQueues.values()) {
    const nextJob = queue.jobs[0];

    if (!nextJob) {
      continue;
    }

    if (nextJob.queuedAt < oldestQueuedAt) {
      oldestQueuedAt = nextJob.queuedAt;
      selectedQueue = queue;
    }
  }

  return selectedQueue;
}

function getTotalQueuedJobs(state: TempTtsGuildPlaybackState): number {
  let total = 0;

  for (const queue of state.roomQueues.values()) {
    total += queue.jobs.length;
  }

  return total;
}

function getOrCreateGuildPlaybackState(
  guildId: string,
): TempTtsGuildPlaybackState {
  const existingState = guildPlaybackStates.get(guildId);

  if (existingState) {
    return existingState;
  }

  const createdState: TempTtsGuildPlaybackState = {
    guildId,
    roomQueues: new Map(),
    connection: null,
    connectedChannelId: null,
    disconnectTimer: null,
    processing: false,
    activeVoiceChannelId: null,
    activeAbortController: null,
    player: createAudioPlayer({
      behaviors: {
        noSubscriber: NoSubscriberBehavior.Stop,
      },
    }),
  };

  guildPlaybackStates.set(guildId, createdState);
  return createdState;
}

function clearDisconnectTimer(state: TempTtsGuildPlaybackState): void {
  if (!state.disconnectTimer) {
    return;
  }

  clearTimeout(state.disconnectTimer);
  state.disconnectTimer = null;
}

function destroyGuildPlaybackState(
  state: TempTtsGuildPlaybackState,
  logger?: Logger,
): void {
  clearDisconnectTimer(state);
  state.activeAbortController?.abort();
  state.activeAbortController = null;
  state.activeVoiceChannelId = null;
  state.player.stop(true);

  if (state.connection) {
    state.connection.destroy();
    state.connection = null;
    state.connectedChannelId = null;
  }

  if (state.roomQueues.size === 0 && !state.processing) {
    guildPlaybackStates.delete(state.guildId);
  }

  if (logger) {
    logger.info({
      event: 'voice_tts_cleanup',
      guildId: state.guildId,
      queuedRooms: state.roomQueues.size,
    });
  }
}

function scheduleDisconnect(state: TempTtsGuildPlaybackState): void {
  if (state.disconnectTimer) {
    return;
  }

  state.disconnectTimer = setTimeout(() => {
    state.disconnectTimer = null;
    destroyGuildPlaybackState(state);
  }, TEMP_TTS_PLAYBACK_IDLE_DISCONNECT_MS);
}

function isUnknownChannelError(error: unknown): error is { code: number } {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === 10003
  );
}

export async function getMissingBotVoicePermissions(
  guild: Guild,
  voiceChannel: VoiceChannel,
): Promise<BotVoicePermissionName[]> {
  let botMember = guild.members.me;

  if (!botMember) {
    try {
      botMember = await guild.members.fetchMe();
    } catch {
      return [...REQUIRED_BOT_VOICE_PERMISSIONS];
    }
  }

  const permissions = voiceChannel.permissionsFor(botMember);

  if (!permissions) {
    return [...REQUIRED_BOT_VOICE_PERMISSIONS];
  }

  return REQUIRED_BOT_VOICE_PERMISSIONS.filter(
    (permission) => !permissions.has(PermissionFlagsBits[permission]),
  );
}

async function fetchPlayableVoiceChannel(
  guild: Guild,
  voiceChannelId: string,
): Promise<FetchedPlayableVoiceChannel | SkippedPlayableVoiceChannel> {
  let channel = null;

  try {
    channel = await guild.channels.fetch(voiceChannelId);
  } catch (error) {
    if (isUnknownChannelError(error)) {
      return {
        status: 'skipped',
        reason: 'voice_channel_missing',
      };
    }

    throw error;
  }

  if (!channel) {
    return {
      status: 'skipped',
      reason: 'voice_channel_missing',
    };
  }

  if (channel.type !== ChannelType.GuildVoice) {
    return {
      status: 'skipped',
      reason: 'voice_channel_invalid',
    };
  }

  const voiceChannel = channel as VoiceChannel;

  if (voiceChannel.members.size === 0) {
    return {
      status: 'skipped',
      reason: 'voice_channel_empty',
    };
  }

  const missingPermissions = await getMissingBotVoicePermissions(
    guild,
    voiceChannel,
  );

  if (missingPermissions.length > 0) {
    return {
      status: 'skipped',
      reason: 'bot_missing_permissions',
      missingPermissions,
    };
  }

  return {
    status: 'ok',
    channel: voiceChannel,
  };
}

export async function synthesizeTempTtsToAudioFile(
  content: string,
  runtimeConfig: TempTtsPiperRuntimeConfig,
  options: {
    signal?: AbortSignal;
    timeoutMs?: number;
    spawnProcess?: typeof spawn;
  } = {},
): Promise<string> {
  const audioFilePath = join(tmpdir(), `pemucik-tts-${randomUUID()}.wav`);
  const spawnProcess = options.spawnProcess ?? spawn;
  const timeoutMs = options.timeoutMs ?? TEMP_TTS_SYNTHESIS_TIMEOUT_MS;

  try {
    await new Promise<void>((resolve, reject) => {
      if (options.signal?.aborted) {
        reject(new TempTtsPlaybackCancelledError());
        return;
      }

      const child = spawnProcess(
        runtimeConfig.command,
        ['--model', runtimeConfig.modelPath, '--output_file', audioFilePath],
        {
          stdio: ['pipe', 'ignore', 'pipe'],
          windowsHide: true,
        },
      );
      let stderr = '';
      let settled = false;

      const finish = (error?: Error): void => {
        if (settled) {
          return;
        }

        settled = true;
        clearTimeout(timeout);
        options.signal?.removeEventListener('abort', cancel);

        if (error) {
          reject(error);
        } else {
          resolve();
        }
      };
      const cancel = (): void => {
        child.kill();
        finish(new TempTtsPlaybackCancelledError());
      };
      const timeout = setTimeout(() => {
        child.kill();
        finish(
          new TempTtsPlaybackStageError(
            'piper_synthesis',
            `Piper synthesis exceeded the ${String(timeoutMs)}ms timeout.`,
          ),
        );
      }, timeoutMs);

      options.signal?.addEventListener('abort', cancel, { once: true });
      child.stderr?.on('data', (chunk: Buffer | string) => {
        stderr += chunk.toString();
      });
      child.once('error', (error) => finish(error));
      child.once('close', (code) => {
        if (code === 0) {
          finish();
          return;
        }

        finish(
          new TempTtsPlaybackStageError(
            'piper_synthesis',
            stderr.trim() || `Piper exited with code ${String(code)}.`,
          ),
        );
      });

      child.stdin?.write(content, 'utf8');
      child.stdin?.end();
    });

    return audioFilePath;
  } catch (error) {
    await removeAudioFile(audioFilePath);
    throw error;
  }
}

async function ensureVoiceConnection(
  state: TempTtsGuildPlaybackState,
  guild: Guild,
  voiceChannel: VoiceChannel,
  logger: Logger,
  signal: AbortSignal,
): Promise<VoiceConnection> {
  clearDisconnectTimer(state);

  let connection = state.connection;

  if (connection && state.connectedChannelId !== voiceChannel.id) {
    connection.destroy();
    state.connection = null;
    state.connectedChannelId = null;
    connection = null;
  }

  let attemptNumber = 0;

  while (attemptNumber < TEMP_TTS_CONNECTION_READY_MAX_ATTEMPTS) {
    if (signal.aborted) {
      throw new TempTtsPlaybackCancelledError();
    }

    attemptNumber += 1;

    logger.info({
      event: 'voice_tts_connection_attempt_started',
      guildId: guild.id,
      voiceChannelId: voiceChannel.id,
      attemptNumber,
      reusingConnection: Boolean(connection),
      adapterAvailable: typeof guild.voiceAdapterCreator === 'function',
    });

    if (!connection) {
      connection = joinVoiceChannel({
        channelId: voiceChannel.id,
        guildId: guild.id,
        adapterCreator:
          guild.voiceAdapterCreator as DiscordGatewayAdapterCreator,
        selfDeaf: false,
      });

      connection.subscribe(state.player);
    }

    attachVoiceConnectionDebugListeners(
      connection,
      logger,
      guild.id,
      voiceChannel.id,
      attemptNumber,
    );

    try {
      await entersState(
        connection,
        VoiceConnectionStatus.Ready,
        TEMP_TTS_CONNECTION_READY_TIMEOUT_MS,
      );
      state.connection = connection;
      state.connectedChannelId = voiceChannel.id;
      return connection;
    } catch {
      const connectionStatus = connection.state.status;
      connection.destroy();

      if (state.connection === connection) {
        state.connection = null;
        state.connectedChannelId = null;
      }

      if (signal.aborted) {
        throw new TempTtsPlaybackCancelledError();
      }

      if (
        !shouldRetryTempTtsVoiceConnectionReady(connectionStatus, attemptNumber)
      ) {
        throw new TempTtsPlaybackStageError(
          'voice_connection_ready',
          `TTS voice connection did not reach Ready within ${String(TEMP_TTS_CONNECTION_READY_TIMEOUT_MS)}ms after ${String(attemptNumber)} attempt(s). Last status: ${connectionStatus}.`,
          {
            connectionStatus,
            attempts: attemptNumber,
          },
        );
      }

      connection = null;
    }
  }

  throw new TempTtsPlaybackStageError(
    'voice_connection_ready',
    `TTS voice connection did not reach Ready within ${String(TEMP_TTS_CONNECTION_READY_TIMEOUT_MS)}ms after ${String(TEMP_TTS_CONNECTION_READY_MAX_ATTEMPTS)} attempt(s).`,
    {
      attempts: TEMP_TTS_CONNECTION_READY_MAX_ATTEMPTS,
    },
  );
}

async function playSynthesizedAudioFile(
  state: TempTtsGuildPlaybackState,
  guild: Guild,
  voiceChannel: VoiceChannel,
  audioFilePath: string,
  logger: Logger,
  signal: AbortSignal,
): Promise<void> {
  await ensureVoiceConnection(state, guild, voiceChannel, logger, signal);

  if (signal.aborted) {
    throw new TempTtsPlaybackCancelledError();
  }

  const resource = createAudioResource(audioFilePath);
  let rejectPlayerError: ((error: Error) => void) | null = null;
  const playerError = new Promise<never>((_resolve, reject) => {
    rejectPlayerError = reject;
  });
  const onPlayerError = (error: Error): void => {
    rejectPlayerError?.(error);
  };
  const onAbort = (): void => {
    state.player.stop(true);
    rejectPlayerError?.(new TempTtsPlaybackCancelledError());
  };

  state.player.once('error', onPlayerError);
  signal.addEventListener('abort', onAbort, { once: true });
  state.player.play(resource);

  try {
    try {
      await Promise.race([
        entersState(
          state.player,
          AudioPlayerStatus.Playing,
          TEMP_TTS_CONNECTION_READY_TIMEOUT_MS,
        ),
        playerError,
      ]);
    } catch (error) {
      if (error instanceof TempTtsPlaybackCancelledError) {
        throw error;
      }

      throw new TempTtsPlaybackStageError(
        'audio_player_playing',
        `TTS audio player did not start playing within ${String(TEMP_TTS_CONNECTION_READY_TIMEOUT_MS)}ms.`,
      );
    }

    try {
      await Promise.race([
        entersState(
          state.player,
          AudioPlayerStatus.Idle,
          TEMP_TTS_PLAYBACK_TIMEOUT_MS,
        ),
        playerError,
      ]);
    } catch (error) {
      if (error instanceof TempTtsPlaybackCancelledError) {
        throw error;
      }

      throw new TempTtsPlaybackStageError(
        'audio_player_idle',
        `TTS audio player did not finish playback within ${String(TEMP_TTS_PLAYBACK_TIMEOUT_MS)}ms.`,
      );
    }
  } finally {
    signal.removeEventListener('abort', onAbort);
    state.player.removeListener('error', onPlayerError);
  }
}

async function removeAudioFile(audioFilePath: string): Promise<void> {
  await rm(audioFilePath, { force: true });
}

async function processGuildPlaybackQueue(
  guild: Guild,
  logger: Logger,
  state: TempTtsGuildPlaybackState,
): Promise<void> {
  let shouldRestartProcessing = false;

  try {
    while (true) {
      const selectedQueue = pickNextTempTtsRoomQueue(state.roomQueues);

      if (!selectedQueue) {
        scheduleDisconnect(state);
        return;
      }

      const nextJob = selectedQueue.jobs.shift();

      if (!nextJob) {
        state.roomQueues.delete(selectedQueue.voiceChannelId);
        continue;
      }

      if (selectedQueue.jobs.length === 0) {
        state.roomQueues.delete(selectedQueue.voiceChannelId);
      }

      const abortController = new AbortController();
      state.activeVoiceChannelId = nextJob.voiceChannelId;
      state.activeAbortController = abortController;

      const runtimeConfig = resolveTempTtsPiperRuntimeConfig(nextJob.voiceKey);

      if (!runtimeConfig) {
        logger.warn({
          event: 'voice_tts_runtime_unavailable',
          guildId: guild.id,
          userId: nextJob.authorId,
          textChannelId: nextJob.textChannelId,
          voiceChannelId: nextJob.voiceChannelId,
          voiceKey: nextJob.voiceKey,
        });
        state.activeVoiceChannelId = null;
        state.activeAbortController = null;
        continue;
      }

      const fetchedChannel = await fetchPlayableVoiceChannel(
        guild,
        nextJob.voiceChannelId,
      );

      if (abortController.signal.aborted) {
        state.activeVoiceChannelId = null;
        state.activeAbortController = null;
        continue;
      }

      if (fetchedChannel.status === 'skipped') {
        if (fetchedChannel.reason === 'bot_missing_permissions') {
          logger.warn({
            event: 'voice_tts_playback_blocked',
            reason: fetchedChannel.reason,
            guildId: guild.id,
            userId: nextJob.authorId,
            textChannelId: nextJob.textChannelId,
            voiceChannelId: nextJob.voiceChannelId,
            voiceKey: nextJob.voiceKey,
            queueLimit: TEMP_TTS_PLAYBACK_QUEUE_LIMIT,
          });
          state.activeVoiceChannelId = null;
          state.activeAbortController = null;
          continue;
        }

        logger.debug({
          event: 'voice_tts_message_skipped',
          reason: fetchedChannel.reason,
          guildId: guild.id,
          userId: nextJob.authorId,
          textChannelId: nextJob.textChannelId,
          voiceChannelId: nextJob.voiceChannelId,
          messageLength: nextJob.content.length,
        });
        state.activeVoiceChannelId = null;
        state.activeAbortController = null;
        continue;
      }

      let audioFilePath: string | null = null;

      try {
        audioFilePath = await synthesizeTempTtsToAudioFile(
          nextJob.content,
          runtimeConfig,
          {
            signal: abortController.signal,
          },
        );
        await playSynthesizedAudioFile(
          state,
          guild,
          fetchedChannel.channel,
          audioFilePath,
          logger,
          abortController.signal,
        );
      } catch (error) {
        if (error instanceof TempTtsPlaybackCancelledError) {
          logger.debug({
            event: 'voice_tts_playback_cancelled',
            guildId: guild.id,
            userId: nextJob.authorId,
            voiceChannelId: nextJob.voiceChannelId,
          });
          continue;
        }

        logger.error(
          {
            event: 'voice_tts_playback_failed',
            guildId: guild.id,
            userId: nextJob.authorId,
            textChannelId: nextJob.textChannelId,
            voiceChannelId: nextJob.voiceChannelId,
            voiceKey: nextJob.voiceKey,
            stage:
              error instanceof TempTtsPlaybackStageError
                ? error.stage
                : undefined,
            connectionStatus:
              error instanceof TempTtsPlaybackStageError
                ? error.details.connectionStatus
                : (state.connection?.state.status ?? undefined),
            connectionReadyAttempts:
              error instanceof TempTtsPlaybackStageError
                ? error.details.attempts
                : undefined,
            playerStatus: state.player.state.status,
          },
          error,
        );
      } finally {
        if (state.activeAbortController === abortController) {
          state.activeAbortController = null;
          state.activeVoiceChannelId = null;
        }

        if (audioFilePath) {
          await removeAudioFile(audioFilePath);
        }
      }
    }
  } finally {
    state.processing = false;
    state.activeAbortController = null;
    state.activeVoiceChannelId = null;
    shouldRestartProcessing =
      pickNextTempTtsRoomQueue(state.roomQueues) !== null;
  }

  if (shouldRestartProcessing) {
    startGuildPlaybackProcessing(guild, logger, state);
    return;
  }

  if (state.roomQueues.size === 0) {
    scheduleDisconnect(state);
  }
}

export function enqueueTempTtsPlayback(
  guild: Guild,
  message: AcceptedTempTtsMessage,
  logger: Logger,
): void {
  const runtimeConfig = resolveTempTtsPiperRuntimeConfig(message.voiceKey);

  if (!runtimeConfig) {
    logger.warn({
      event: 'voice_tts_runtime_unavailable',
      guildId: guild.id,
      userId: message.authorId,
      textChannelId: message.textChannelId,
      voiceChannelId: message.voiceChannelId,
      voiceKey: message.voiceKey,
    });
    return;
  }

  const state = getOrCreateGuildPlaybackState(guild.id);
  clearDisconnectTimer(state);

  if (getTotalQueuedJobs(state) >= TEMP_TTS_GUILD_QUEUE_LIMIT) {
    logger.warn({
      event: 'voice_tts_queue_overflow',
      reason: 'guild_queue_limit',
      guildId: guild.id,
      userId: message.authorId,
      textChannelId: message.textChannelId,
      voiceChannelId: message.voiceChannelId,
      voiceKey: message.voiceKey,
      queueLimit: TEMP_TTS_GUILD_QUEUE_LIMIT,
    });
    return;
  }

  const existingQueue = state.roomQueues.get(message.voiceChannelId);
  const roomQueue = existingQueue ?? {
    voiceChannelId: message.voiceChannelId,
    jobs: [],
  };

  if (roomQueue.jobs.length >= TEMP_TTS_PLAYBACK_QUEUE_LIMIT) {
    logger.warn({
      event: 'voice_tts_queue_overflow',
      guildId: guild.id,
      userId: message.authorId,
      textChannelId: message.textChannelId,
      voiceChannelId: message.voiceChannelId,
      voiceKey: message.voiceKey,
      queueLimit: TEMP_TTS_PLAYBACK_QUEUE_LIMIT,
    });
    return;
  }

  roomQueue.jobs.push({
    ...message,
    queuedAt: Date.now(),
  });

  state.roomQueues.set(message.voiceChannelId, roomQueue);

  logger.info({
    event: 'voice_tts_message_queued',
    guildId: guild.id,
    userId: message.authorId,
    textChannelId: message.textChannelId,
    voiceChannelId: message.voiceChannelId,
    voiceKey: message.voiceKey,
    modelEnvVarName: runtimeConfig.modelEnvVarName,
    messageLength: message.content.length,
    queueDepth: roomQueue.jobs.length,
    guildQueueDepth: getTotalQueuedJobs(state),
  });

  if (!state.processing) {
    startGuildPlaybackProcessing(guild, logger, state);
  }
}

export function cleanupTempTtsPlaybackForVoiceChannel(
  guildId: string,
  voiceChannelId: string,
): boolean {
  const state = guildPlaybackStates.get(guildId);

  if (!state) {
    return false;
  }

  clearDisconnectTimer(state);
  const removedQueuedRoom = state.roomQueues.delete(voiceChannelId);
  const disconnectedActiveRoom = state.connectedChannelId === voiceChannelId;
  const cancelledActiveRoom = state.activeVoiceChannelId === voiceChannelId;

  if (cancelledActiveRoom) {
    state.activeAbortController?.abort();
  }

  if (disconnectedActiveRoom || cancelledActiveRoom) {
    state.player.stop(true);

    if (state.connection) {
      state.connection.destroy();
      state.connection = null;
    }

    state.connectedChannelId = null;
  }

  if (
    !state.processing &&
    state.roomQueues.size === 0 &&
    state.connectedChannelId === null
  ) {
    guildPlaybackStates.delete(guildId);
  }

  return removedQueuedRoom || disconnectedActiveRoom || cancelledActiveRoom;
}

export function destroyAllTempTtsPlayback(logger?: Logger): void {
  for (const state of guildPlaybackStates.values()) {
    destroyGuildPlaybackState(state, logger);
  }

  guildPlaybackStates.clear();
}

export function getTempTtsPlaybackStateSummary(
  guildId: string,
): TempTtsPlaybackStateSummary | null {
  const state = guildPlaybackStates.get(guildId);

  if (!state) {
    return null;
  }

  return {
    queuedVoiceChannelIds: [...state.roomQueues.keys()].sort(),
    connectedChannelId: state.connectedChannelId,
    processing: state.processing,
  };
}

export function seedTempTtsPlaybackStateForTests(
  input: SeedTempTtsPlaybackStateForTestsInput,
): void {
  const state = getOrCreateGuildPlaybackState(input.guildId);
  state.roomQueues.clear();

  for (const voiceChannelId of input.queuedVoiceChannelIds ?? []) {
    state.roomQueues.set(voiceChannelId, {
      voiceChannelId,
      jobs: [],
    });
  }

  state.connectedChannelId = input.connectedChannelId ?? null;
  state.processing = input.processing ?? false;
  state.activeVoiceChannelId = null;
  state.activeAbortController = null;
  state.connection = input.connectedChannelId
    ? ({
        destroy: () => {
          input.onDestroyConnection?.();
        },
      } as VoiceConnection)
    : null;
}

function startGuildPlaybackProcessing(
  guild: Guild,
  logger: Logger,
  state: TempTtsGuildPlaybackState,
): void {
  state.processing = true;

  void processGuildPlaybackQueue(guild, logger, state).catch((error) => {
    logger.error(
      {
        event: 'voice_tts_playback_failed',
        guildId: guild.id,
        connectedChannelId: state.connectedChannelId ?? undefined,
      },
      error,
    );
  });
}
