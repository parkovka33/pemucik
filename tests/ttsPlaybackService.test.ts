import assert from 'node:assert/strict';
import test from 'node:test';

import {
  VoiceConnectionStatus
} from '@discordjs/voice';

import {
  cleanupTempTtsPlaybackForVoiceChannel,
  destroyAllTempTtsPlayback,
  getTempTtsPlaybackStateSummary,
  pickNextTempTtsRoomQueue,
  resolveTempTtsPiperRuntimeConfig,
  seedTempTtsPlaybackStateForTests,
  shouldRetryTempTtsVoiceConnectionReady,
  type QueuedTempTtsPlaybackJob,
  type TempTtsRoomQueue,
} from '../src/services/ttsPlaybackService';

function createQueuedJob(overrides: Partial<QueuedTempTtsPlaybackJob> = {}): QueuedTempTtsPlaybackJob {
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
    [
      'voice-3',
      createRoomQueue('voice-3', []),
    ],
  ]);

  const selectedQueue = pickNextTempTtsRoomQueue(roomQueues);

  assert.equal(selectedQueue?.voiceChannelId, 'voice-2');
  assert.equal(selectedQueue?.jobs[0]?.queuedAt, 125);
});

test('shouldRetryTempTtsVoiceConnectionReady retries only transient connection states before max attempts', () => {
  assert.equal(shouldRetryTempTtsVoiceConnectionReady(VoiceConnectionStatus.Signalling, 1), true);
  assert.equal(shouldRetryTempTtsVoiceConnectionReady(VoiceConnectionStatus.Connecting, 2), true);
  assert.equal(shouldRetryTempTtsVoiceConnectionReady(VoiceConnectionStatus.Disconnected, 1), true);
  assert.equal(shouldRetryTempTtsVoiceConnectionReady(VoiceConnectionStatus.Ready, 1), false);
  assert.equal(shouldRetryTempTtsVoiceConnectionReady(VoiceConnectionStatus.Connecting, 3), false);
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

    const missingCleaned = cleanupTempTtsPlaybackForVoiceChannel('guild-1', 'voice-missing');

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
