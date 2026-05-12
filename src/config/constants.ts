export const APP_NAME = 'Noi';
export const APP_COLOR = 0x5865f2;
export const DISCORD_DARK_EMBED_COLOR = 0x2b2d31;

export const DEFAULT_LOG_LEVEL = 'info';
export const DEFAULT_DATABASE_PATH = './data/xenovoice.sqlite';
export const DEFAULT_NODE_ENV = 'development';
export const DEFAULT_CATEGORY_NAME = 'Noi';
export const DEFAULT_DONATION_URL = 'https://donatty.com/parks33';
export const DEFAULT_GENERATOR_CHANNEL_NAME = 'Войти, чтобы создать';
export const DEFAULT_NAME_TEMPLATE = 'Комната {user}';
export const DEFAULT_USER_LIMIT = 0;
export const DEFAULT_BITRATE = 0;
export const DEFAULT_MAX_TEMP_CHANNELS = 25;
export const CREATE_TEMP_CHANNEL_COOLDOWN_SECONDS = 10;
export const RENAME_TEMP_CHANNEL_COOLDOWN_SECONDS = 10;
export const TEMP_CHANNEL_CLEANUP_DELAY_MS = 0;
export const TEMP_TTS_MAX_MESSAGE_LENGTH = 240;
export const TEMP_TTS_PLAYBACK_QUEUE_LIMIT = 5;
export const TEMP_TTS_PLAYBACK_IDLE_DISCONNECT_MS = 15_000;
export const TEMP_TTS_CONNECTION_READY_TIMEOUT_MS = 15_000;
export const TEMP_TTS_PLAYBACK_TIMEOUT_MS = 120_000;
export const PANEL_CUSTOM_ID_PREFIX = 'xv:panel';
export const PANEL_RENAME_INPUT_ID = 'name';
export const INTERFACE_CUSTOM_ID_PREFIX = 'xv:interface';
export const INTERFACE_MESSAGE_TITLE = 'Noi Interface';
export const INTERFACE_MEMBER_INPUT_ID = 'member';
export const INTERFACE_LIMIT_INPUT_ID = 'limit';
export const INTERFACE_REGION_SELECT_ID = `${INTERFACE_CUSTOM_ID_PREFIX}:region_select`;
export const INTERFACE_DELETE_CONFIRM_ID = `${INTERFACE_CUSTOM_ID_PREFIX}:delete_confirm`;
export const INTERFACE_DELETE_CANCEL_ID = `${INTERFACE_CUSTOM_ID_PREFIX}:delete_cancel`;
export const DEFAULT_INTERFACE_CHANNEL_NAME = 'noi-interface';
export const TEMP_CHANNEL_ALLOWED_USER_LIMITS = [0, 2, 5, 10] as const;
export const MIN_TEMP_CHANNEL_BITRATE_KBPS = 8;
export const MAX_TEMP_CHANNEL_BITRATE_KBPS = 384;
export const COMMON_VOICE_REGION_IDS = [
  'auto',
  'brazil',
  'hongkong',
  'india',
  'japan',
  'rotterdam',
  'russia',
  'singapore',
  'southafrica',
  'sydney',
  'us-central',
  'us-east',
  'us-south',
  'us-west',
] as const;

export const DISCORD_INTENTS = [
  'Guilds',
  'GuildVoiceStates',
  'GuildMembers',
] as const;
