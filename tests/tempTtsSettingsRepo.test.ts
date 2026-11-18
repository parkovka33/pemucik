import assert from 'node:assert/strict';
import test from 'node:test';

import { DEFAULT_NAME_TEMPLATE } from '../src/config/constants';
import { upsertGuildSettings } from '../src/db/repositories/guildSettingsRepo';
import {
  deleteTempChannelByChannelId,
  insertTempChannel,
} from '../src/db/repositories/tempChannelsRepo';
import {
  deleteTempTtsSettingsByVoiceChannelId,
  findTempTtsSettingsByVoiceChannelId,
  listTempTtsSettingsByGuildId,
  updateTempTtsEnabled,
  updateTempTtsVoiceKey,
  upsertTempTtsSettings,
} from '../src/db/repositories/tempTtsSettingsRepo';
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

function seedTrackedRoom(channelId: string, ownerUserId = 'owner-user'): void {
  insertTempChannel({
    channelId,
    guildId: 'guild-1',
    ownerUserId,
    categoryId: 'category-1',
    isLocked: false,
    userLimit: 0,
  });
}

test('upsertTempTtsSettings creates default disabled room-level TTS settings', () => {
  const { cleanup } = setupTestDatabase();

  try {
    seedGuildSettings();
    seedTrackedRoom('voice-1');

    const record = upsertTempTtsSettings({
      voiceChannelId: 'voice-1',
      guildId: 'guild-1',
    });

    assert.equal(record.voiceChannelId, 'voice-1');
    assert.equal(record.guildId, 'guild-1');
    assert.equal(record.enabled, false);
    assert.equal(record.voiceKey, 'default');
    assert.ok(record.createdAt.length > 0);
    assert.ok(record.updatedAt.length > 0);
    assert.deepEqual(findTempTtsSettingsByVoiceChannelId('voice-1'), record);
  } finally {
    cleanup();
  }
});

test('temp_tts_settings rows are removed automatically when the tracked temp room row is deleted', () => {
  const { cleanup } = setupTestDatabase();

  try {
    seedGuildSettings();
    seedTrackedRoom('voice-1');
    upsertTempTtsSettings({
      voiceChannelId: 'voice-1',
      guildId: 'guild-1',
      enabled: true,
      voiceKey: 'ru-alt',
    });

    deleteTempChannelByChannelId('voice-1');

    assert.equal(findTempTtsSettingsByVoiceChannelId('voice-1'), null);
  } finally {
    cleanup();
  }
});

test('upsertTempTtsSettings updates an existing row and listTempTtsSettingsByGuildId returns guild records', () => {
  const { cleanup } = setupTestDatabase();

  try {
    seedGuildSettings();
    seedTrackedRoom('voice-1');
    seedTrackedRoom('voice-2', 'owner-user-2');

    upsertTempTtsSettings({
      voiceChannelId: 'voice-1',
      guildId: 'guild-1',
    });
    const updated = upsertTempTtsSettings({
      voiceChannelId: 'voice-1',
      guildId: 'guild-1',
      enabled: true,
      voiceKey: 'ru-alt',
    });
    const second = upsertTempTtsSettings({
      voiceChannelId: 'voice-2',
      guildId: 'guild-1',
      enabled: true,
      voiceKey: 'en-default',
    });

    assert.equal(updated.enabled, true);
    assert.equal(updated.voiceKey, 'ru-alt');
    assert.deepEqual(listTempTtsSettingsByGuildId('guild-1'), [
      updated,
      second,
    ]);
  } finally {
    cleanup();
  }
});

test('upsertTempTtsSettings preserves omitted fields on an existing row', () => {
  const { cleanup } = setupTestDatabase();

  try {
    seedGuildSettings();
    seedTrackedRoom('voice-1');
    upsertTempTtsSettings({
      voiceChannelId: 'voice-1',
      guildId: 'guild-1',
      enabled: true,
      voiceKey: 'ru-alt',
    });

    const afterVoiceOnlyUpdate = upsertTempTtsSettings({
      voiceChannelId: 'voice-1',
      guildId: 'guild-1',
      voiceKey: 'en-default',
    });
    const afterNoFieldUpdate = upsertTempTtsSettings({
      voiceChannelId: 'voice-1',
      guildId: 'guild-1',
    });

    assert.equal(afterVoiceOnlyUpdate.enabled, true);
    assert.equal(afterVoiceOnlyUpdate.voiceKey, 'en-default');
    assert.equal(afterNoFieldUpdate.enabled, true);
    assert.equal(afterNoFieldUpdate.voiceKey, 'en-default');
  } finally {
    cleanup();
  }
});

test('updateTempTtsEnabled and updateTempTtsVoiceKey change only the requested persisted fields', () => {
  const { cleanup } = setupTestDatabase();

  try {
    seedGuildSettings();
    seedTrackedRoom('voice-1');
    upsertTempTtsSettings({
      voiceChannelId: 'voice-1',
      guildId: 'guild-1',
    });

    const enabledRecord = updateTempTtsEnabled('voice-1', true);
    const voicedRecord = updateTempTtsVoiceKey('voice-1', 'ru-alt');

    assert.equal(enabledRecord.enabled, true);
    assert.equal(enabledRecord.voiceKey, 'default');
    assert.equal(voicedRecord.enabled, true);
    assert.equal(voicedRecord.voiceKey, 'ru-alt');
  } finally {
    cleanup();
  }
});

test('deleteTempTtsSettingsByVoiceChannelId removes only the targeted row', () => {
  const { cleanup } = setupTestDatabase();

  try {
    seedGuildSettings();
    seedTrackedRoom('voice-1');
    seedTrackedRoom('voice-2', 'owner-user-2');
    upsertTempTtsSettings({
      voiceChannelId: 'voice-1',
      guildId: 'guild-1',
    });
    upsertTempTtsSettings({
      voiceChannelId: 'voice-2',
      guildId: 'guild-1',
    });

    deleteTempTtsSettingsByVoiceChannelId('voice-1');

    assert.equal(findTempTtsSettingsByVoiceChannelId('voice-1'), null);
    assert.equal(
      findTempTtsSettingsByVoiceChannelId('voice-2')?.voiceChannelId,
      'voice-2',
    );
  } finally {
    cleanup();
  }
});
