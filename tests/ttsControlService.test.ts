import assert from 'node:assert/strict';
import test from 'node:test';

import { DEFAULT_NAME_TEMPLATE } from '../src/config/constants';
import { upsertGuildSettings } from '../src/db/repositories/guildSettingsRepo';
import { insertTempChannel } from '../src/db/repositories/tempChannelsRepo';
import {
  findTempTtsSettingsByVoiceChannelId,
  upsertTempTtsSettings,
} from '../src/db/repositories/tempTtsSettingsRepo';
import {
  resolveTempTtsActionInput,
  setRoomTtsEnabled,
  setRoomTtsVoicePreset,
  TtsControlServiceError,
} from '../src/services/ttsControlService';
import { setupTestDatabase } from './helpers/testDatabase';

function seedGuildSettings(): void {
  upsertGuildSettings({
    guildId: 'guild-1',
    categoryId: 'category-1',
    generatorChannelId: 'generator-1',
    editableByOwner: true,
    permissionSource: 'category',
    defaultNameTemplate: DEFAULT_NAME_TEMPLATE,
    defaultUserLimit: 0,
    defaultBitrate: 0,
    language: 'ru',
    maxTempChannels: 25,
    interfaceChannelId: null,
    interfaceMessageId: null,
  });
}

function seedTrackedRoom(channelId = 'voice-1'): void {
  insertTempChannel({
    channelId,
    guildId: 'guild-1',
    ownerUserId: 'owner-user',
    categoryId: 'category-1',
    isLocked: false,
    userLimit: 0,
  });
}

function createTarget(actorCanManage = true, channelId = 'voice-1') {
  return {
    record: {
      channelId,
      guildId: 'guild-1',
      ownerUserId: 'owner-user',
      categoryId: 'category-1',
      createdAt: '2026-05-10T00:00:00Z',
      lastActiveAt: '2026-05-10T00:00:00Z',
      isLocked: false,
      userLimit: 0,
    },
    channel: {
      id: channelId,
    },
    actorCanManage,
    actorCanClaimOwnership: false,
    accessMode: actorCanManage ? 'owner' : 'claim',
  };
}

test('resolveTempTtsActionInput rejects empty and conflicting input', () => {
  assert.throws(
    () => resolveTempTtsActionInput(null, null),
    (error: unknown) =>
      error instanceof TtsControlServiceError
      && error.code === 'TTS_ACTION_REQUIRED',
  );

  assert.throws(
    () => resolveTempTtsActionInput(true, 'default'),
    (error: unknown) =>
      error instanceof TtsControlServiceError
      && error.code === 'TTS_ACTION_CONFLICT',
  );
});

test('setRoomTtsEnabled creates persisted room-level settings when a linked temp text channel exists', () => {
  const { cleanup } = setupTestDatabase();

  try {
    seedGuildSettings();
    seedTrackedRoom();

    const record = setRoomTtsEnabled(createTarget() as never, true);

    assert.equal(record.voiceChannelId, 'voice-1');
    assert.equal(record.enabled, true);
    assert.equal(record.voiceKey, 'default');
    assert.equal(findTempTtsSettingsByVoiceChannelId('voice-1')?.enabled, true);
  } finally {
    cleanup();
  }
});

test('setRoomTtsVoicePreset updates only the curated voice preset for an existing room row', () => {
  const { cleanup } = setupTestDatabase();

  try {
    seedGuildSettings();
    seedTrackedRoom();
    upsertTempTtsSettings({
      voiceChannelId: 'voice-1',
      guildId: 'guild-1',
      enabled: true,
      voiceKey: 'default',
    });

    const record = setRoomTtsVoicePreset(createTarget() as never, 'ru-alt');

    assert.equal(record.enabled, true);
    assert.equal(record.voiceKey, 'ru-alt');
    assert.equal(findTempTtsSettingsByVoiceChannelId('voice-1')?.voiceKey, 'ru-alt');
  } finally {
    cleanup();
  }
});

test('setRoomTtsEnabled requires manage access but no longer requires a linked temp text channel mapping', () => {
  const { cleanup } = setupTestDatabase();

  try {
    seedGuildSettings();
    seedTrackedRoom();

    assert.throws(
      () => setRoomTtsEnabled(createTarget(false) as never, true),
      (error: unknown) =>
        error instanceof TtsControlServiceError
        && error.code === 'NOT_OWNER_OR_ADMIN',
    );

    const record = setRoomTtsEnabled(createTarget() as never, true);

    assert.equal(record.enabled, true);
    assert.equal(findTempTtsSettingsByVoiceChannelId('voice-1')?.enabled, true);
  } finally {
    cleanup();
  }
});

test('setRoomTtsVoicePreset rejects unknown preset keys', () => {
  const { cleanup } = setupTestDatabase();

  try {
    seedGuildSettings();
    seedTrackedRoom();

    assert.throws(
      () => setRoomTtsVoicePreset(createTarget() as never, 'does-not-exist'),
      (error: unknown) =>
        error instanceof TtsControlServiceError
        && error.code === 'VOICE_PRESET_INVALID',
    );
  } finally {
    cleanup();
  }
});
