import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { access, readFile, rm, writeFile } from 'node:fs/promises';
import { PassThrough } from 'node:stream';
import test from 'node:test';

import { VoiceConnectionStatus } from '@discordjs/voice';
import { PermissionFlagsBits } from 'discord.js';

import {
  cleanupTempTtsPlaybackForVoiceChannel,
  destroyAllTempTtsPlayback,
  findTempTtsMediaDependencyProblems,
  getTempTtsPlaybackStateSummary,
  getMissingBotVoicePermissions,
  pickNextTempTtsRoomQueue,
  resolveTempTtsPiperRuntimeConfig,
  seedTempTtsPlaybackStateForTests,
  shouldRetryTempTtsVoiceConnectionReady,
  synthesizeTempTtsToAudioFile,
  type QueuedTempTtsPlaybackJob,
  type TempTtsRoomQueue,
} from '../src/services/ttsPlaybackService';

function createFakePiperSpawn(
  options: { closeCode?: number; neverClose?: boolean } = {},
) {
  let outputFilePath: string | null = null;
  let killed = false;

  const spawnProcess = ((_command: string, args: readonly string[]) => {
    const child = new EventEmitter() as EventEmitter & {
      stdin: PassThrough;
      stderr: PassThrough;
      kill: () => boolean;
    };
    child.stdin = new PassThrough();
    child.stderr = new PassThrough();
    child.kill = () => {
      killed = true;
      return true;
    };
    const outputIndex = args.indexOf('--output_file');
    outputFilePath = outputIndex >= 0 ? (args[outputIndex + 1] ?? null) : null;

    child.stdin.once('finish', () => {
      if (!outputFilePath) {
        child.emit('close', 2);
        return;
      }

      void writeFile(outputFilePath, Buffer.from('RIFF-fake-wave')).then(() => {
        if (!options.neverClose) {
          child.emit('close', options.closeCode ?? 0);
        }
      });
    });

    return child;
  }) as unknown as typeof import('node:child_process').spawn;

  return {
    spawnProcess,
    getOutputFilePath: () => outputFilePath,
    wasKilled: () => killed,
  };
}

function createQueuedJob(
  overrides: Partial<QueuedTempTtsPlaybackJob> = {},
): QueuedTempTtsPlaybackJob {
  return {
    status: 'accepted',
    guildId: 'guild-1',
    textChannelId: 'text-1',
    voiceChannelId: 'voice-1',
    authorId: 'member-1',
    voiceKey: 'default',
    content: 'hello world',
    queuedAt: 100,
    ...overrides,
  };
}

function createRoomQueue(
  voiceChannelId: string,
  jobs: QueuedTempTtsPlaybackJob[],
): TempTtsRoomQueue {
  return {
    voiceChannelId,
    jobs,
  };
}

test('resolveTempTtsPiperRuntimeConfig resolves a configured Piper command and preset model path', () => {
  const runtimeConfig = resolveTempTtsPiperRuntimeConfig('default', {
    PIPER_COMMAND: '/usr/local/bin/piper',
    PIPER_MODEL_DEFAULT: '/opt/piper/ru-default.onnx',
  });

  assert.deepEqual(runtimeConfig, {
    command: '/usr/local/bin/piper',
    modelEnvVarName: 'PIPER_MODEL_DEFAULT',
    modelPath: '/opt/piper/ru-default.onnx',
  });
});

test('resolveTempTtsPiperRuntimeConfig returns null when the selected preset model path is missing', () => {
  const runtimeConfig = resolveTempTtsPiperRuntimeConfig('ru-alt', {
    PIPER_COMMAND: '/usr/local/bin/piper',
  });

  assert.equal(runtimeConfig, null);
});

test('findTempTtsMediaDependencyProblems reports missing FFmpeg and accepts opusscript', () => {
  const problems = findTempTtsMediaDependencyProblems(`
Opus Libraries
- @discordjs/opus: not found
- opusscript: 0.0.8

FFmpeg
- not found
`);

  assert.deepEqual(problems, ['FFmpeg is not available on PATH.']);
});

test('synthesizeTempTtsToAudioFile streams text through a Piper-compatible process and returns its WAV', async () => {
  const fake = createFakePiperSpawn();
  const audioFilePath = await synthesizeTempTtsToAudioFile(
    'hello world',
    {
      command: 'fake-piper',
      modelEnvVarName: 'PIPER_MODEL_DEFAULT',
      modelPath: 'fake-model.onnx',
    },
    {
      spawnProcess: fake.spawnProcess,
      timeoutMs: 1_000,
    },
  );

  try {
    assert.equal(audioFilePath, fake.getOutputFilePath());
    assert.equal((await readFile(audioFilePath)).toString(), 'RIFF-fake-wave');
  } finally {
    await rm(audioFilePath, { force: true });
  }
});

test('synthesizeTempTtsToAudioFile kills timed-out Piper and removes its partial WAV', async () => {
  const fake = createFakePiperSpawn({ neverClose: true });

  await assert.rejects(
    synthesizeTempTtsToAudioFile(
      'hello world',
      {
        command: 'fake-piper',
        modelEnvVarName: 'PIPER_MODEL_DEFAULT',
        modelPath: 'fake-model.onnx',
      },
      {
        spawnProcess: fake.spawnProcess,
        timeoutMs: 20,
      },
    ),
    /Piper synthesis exceeded/,
  );

  assert.equal(fake.wasKilled(), true);
  const partialPath = fake.getOutputFilePath();
  assert.ok(partialPath);
  await assert.rejects(access(partialPath));
});

test('pickNextTempTtsRoomQueue selects the room whose head job is oldest across queued rooms', () => {
  const roomQueues = new Map<string, TempTtsRoomQueue>([
    [
      'voice-1',
      createRoomQueue('voice-1', [
        createQueuedJob({ voiceChannelId: 'voice-1', queuedAt: 300 }),
      ]),
    ],
    [
      'voice-2',
      createRoomQueue('voice-2', [
        createQueuedJob({ voiceChannelId: 'voice-2', queuedAt: 125 }),
        createQueuedJob({ voiceChannelId: 'voice-2', queuedAt: 500 }),
      ]),
    ],
    ['voice-3', createRoomQueue('voice-3', [])],
  ]);

  const selectedQueue = pickNextTempTtsRoomQueue(roomQueues);

  assert.equal(selectedQueue?.voiceChannelId, 'voice-2');
  assert.equal(selectedQueue?.jobs[0]?.queuedAt, 125);
});

test('shouldRetryTempTtsVoiceConnectionReady retries only transient connection states before max attempts', () => {
  assert.equal(
    shouldRetryTempTtsVoiceConnectionReady(VoiceConnectionStatus.Signalling, 1),
    true,
  );
  assert.equal(
    shouldRetryTempTtsVoiceConnectionReady(VoiceConnectionStatus.Connecting, 2),
    true,
  );
  assert.equal(
    shouldRetryTempTtsVoiceConnectionReady(
      VoiceConnectionStatus.Disconnected,
      1,
    ),
    true,
  );
  assert.equal(
    shouldRetryTempTtsVoiceConnectionReady(VoiceConnectionStatus.Ready, 1),
    false,
  );
  assert.equal(
    shouldRetryTempTtsVoiceConnectionReady(VoiceConnectionStatus.Connecting, 3),
    false,
  );
});

test('getMissingBotVoicePermissions reports the exact required permission that is absent', async () => {
  const missingPermissions = await getMissingBotVoicePermissions(
    {
      members: {
        me: { id: 'bot-1' },
      },
    } as never,
    {
      permissionsFor: () => ({
        has: (permission: bigint) => permission !== PermissionFlagsBits.Speak,
      }),
    } as never,
  );

  assert.deepEqual(missingPermissions, ['Speak']);
});

test('cleanupTempTtsPlaybackForVoiceChannel removes only the targeted queued room and disconnects the active room when needed', () => {
  const destroyedConnections: string[] = [];

  try {
    seedTempTtsPlaybackStateForTests({
      guildId: 'guild-1',
      queuedVoiceChannelIds: ['voice-1', 'voice-2'],
      connectedChannelId: 'voice-1',
      onDestroyConnection: () => {
        destroyedConnections.push('voice-1');
      },
    });

    const cleaned = cleanupTempTtsPlaybackForVoiceChannel('guild-1', 'voice-1');

    assert.equal(cleaned, true);
    assert.deepEqual(destroyedConnections, ['voice-1']);
    assert.deepEqual(getTempTtsPlaybackStateSummary('guild-1'), {
      queuedVoiceChannelIds: ['voice-2'],
      connectedChannelId: null,
      processing: false,
    });

    const missingCleaned = cleanupTempTtsPlaybackForVoiceChannel(
      'guild-1',
      'voice-missing',
    );

    assert.equal(missingCleaned, false);
    assert.deepEqual(getTempTtsPlaybackStateSummary('guild-1'), {
      queuedVoiceChannelIds: ['voice-2'],
      connectedChannelId: null,
      processing: false,
    });
  } finally {
    destroyAllTempTtsPlayback();
  }
});
