import {
  findTempTtsSettingsByVoiceChannelId,
  updateTempTtsEnabled,
  updateTempTtsVoiceKey,
  upsertTempTtsSettings,
} from '../db/repositories/tempTtsSettingsRepo';

import type { TempTtsSettingsRecord } from '../types';
import type { ResolvedPanelTarget } from './panelService';

export const TEMP_TTS_VOICE_PRESETS = [
  {
    key: 'default',
    label: 'Русский — стандартный',
    modelEnvVarName: 'PIPER_MODEL_DEFAULT',
  },
  {
    key: 'ru-alt',
    label: 'Русский — альтернативный',
    modelEnvVarName: 'PIPER_MODEL_RU_ALT',
  },
  {
    key: 'en-default',
    label: 'English — standard',
    modelEnvVarName: 'PIPER_MODEL_EN_DEFAULT',
  },
] as const;

const TEMP_TTS_VOICE_PRESET_MAP = new Map<string, (typeof TEMP_TTS_VOICE_PRESETS)[number]>(
  TEMP_TTS_VOICE_PRESETS.map((preset) => [preset.key, preset]),
);

export class TtsControlServiceError extends Error {
  public constructor(
    public readonly code:
      | 'NOT_OWNER_OR_ADMIN'
      | 'VOICE_PRESET_INVALID'
      | 'TTS_ACTION_REQUIRED'
      | 'TTS_ACTION_CONFLICT',
    message: string,
  ) {
    super(message);
    this.name = 'TtsControlServiceError';
  }
}

export function resolveTempTtsActionInput(
  enabled: boolean | null,
  voiceKey: string | null,
): { kind: 'enabled'; enabled: boolean } | { kind: 'voice'; voiceKey: string } {
  const normalizedVoiceKey = voiceKey?.trim().toLowerCase() ?? null;
  const hasEnabled = enabled !== null;
  const hasVoiceKey = normalizedVoiceKey !== null && normalizedVoiceKey.length > 0;

  if (hasEnabled && hasVoiceKey) {
    throw new TtsControlServiceError(
      'TTS_ACTION_CONFLICT',
      'Укажите только один параметр для `/voice tts`: либо `enabled`, либо `voice`.',
    );
  }

  if (!hasEnabled && !hasVoiceKey) {
    throw new TtsControlServiceError(
      'TTS_ACTION_REQUIRED',
      'Укажите `enabled:true|false` или выберите `voice`, чтобы обновить настройки TTS для комнаты.',
    );
  }

  if (hasEnabled) {
    return {
      kind: 'enabled',
      enabled: enabled!,
    };
  }

  return {
    kind: 'voice',
    voiceKey: normalizedVoiceKey!,
  };
}

function assertManageAccess(target: ResolvedPanelTarget): void {
  if (target.actorCanManage) {
    return;
  }

  throw new TtsControlServiceError(
    'NOT_OWNER_OR_ADMIN',
    'Только владелец комнаты или администратор сервера может настраивать TTS для этой комнаты.',
  );
}

function resolveVoicePreset(voiceKey: string): (typeof TEMP_TTS_VOICE_PRESETS)[number] {
  const preset = TEMP_TTS_VOICE_PRESET_MAP.get(voiceKey);

  if (preset) {
    return preset;
  }

  throw new TtsControlServiceError(
    'VOICE_PRESET_INVALID',
    'Выберите один из доступных voice preset для TTS.',
  );
}

export function findTempTtsVoicePreset(voiceKey: string): (typeof TEMP_TTS_VOICE_PRESETS)[number] | null {
  return TEMP_TTS_VOICE_PRESET_MAP.get(voiceKey.trim().toLowerCase()) ?? null;
}

function ensureRoomTtsSettings(target: ResolvedPanelTarget): TempTtsSettingsRecord {
  return findTempTtsSettingsByVoiceChannelId(target.channel.id) ?? upsertTempTtsSettings({
    voiceChannelId: target.channel.id,
    guildId: target.record.guildId,
  });
}

export function describeTempTtsVoicePreset(voiceKey: string): string {
  return TEMP_TTS_VOICE_PRESET_MAP.get(voiceKey)?.label ?? voiceKey;
}

export function formatTempTtsSettingsState(record: TempTtsSettingsRecord): string {
  return [
    `TTS: ${record.enabled ? 'включён' : 'выключен'}`,
    `Голос: ${describeTempTtsVoicePreset(record.voiceKey)}`,
  ].join('\n');
}

export function setRoomTtsEnabled(target: ResolvedPanelTarget, enabled: boolean): TempTtsSettingsRecord {
  assertManageAccess(target);

  const existingRecord = ensureRoomTtsSettings(target);

  return updateTempTtsEnabled(existingRecord.voiceChannelId, enabled);
}

export function setRoomTtsVoicePreset(
  target: ResolvedPanelTarget,
  rawVoiceKey: string,
): TempTtsSettingsRecord {
  assertManageAccess(target);

  const preset = resolveVoicePreset(rawVoiceKey.trim().toLowerCase());
  const existingRecord = ensureRoomTtsSettings(target);

  return updateTempTtsVoiceKey(existingRecord.voiceChannelId, preset.key);
}
