CREATE TABLE IF NOT EXISTS guild_settings (
  guild_id TEXT PRIMARY KEY,
  category_id TEXT NOT NULL,
  generator_channel_id TEXT NOT NULL,
  editable_by_owner INTEGER NOT NULL DEFAULT 0,
  permission_source TEXT NOT NULL DEFAULT "category",
  default_name_template TEXT NOT NULL DEFAULT "{user}'s Room",
  default_user_limit INTEGER NOT NULL DEFAULT 0,
  default_bitrate INTEGER NOT NULL DEFAULT 0,
  language TEXT NOT NULL DEFAULT "en",
  max_temp_channels INTEGER NOT NULL DEFAULT 25,
  interface_channel_id TEXT,
  interface_message_id TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS temp_channels (
  channel_id TEXT PRIMARY KEY,
  guild_id TEXT NOT NULL,
  owner_user_id TEXT NOT NULL,
  category_id TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_active_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  is_locked INTEGER NOT NULL DEFAULT 0,
  user_limit INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY (guild_id) REFERENCES guild_settings(guild_id)
);

CREATE INDEX IF NOT EXISTS idx_temp_channels_guild_id
ON temp_channels(guild_id);

CREATE INDEX IF NOT EXISTS idx_temp_channels_owner_user_id
ON temp_channels(owner_user_id);

CREATE TABLE IF NOT EXISTS temp_text_channels (
  text_channel_id TEXT PRIMARY KEY,
  voice_channel_id TEXT NOT NULL UNIQUE,
  guild_id TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (guild_id) REFERENCES guild_settings(guild_id)
);

CREATE INDEX IF NOT EXISTS idx_temp_text_channels_guild_id
ON temp_text_channels(guild_id);

CREATE INDEX IF NOT EXISTS idx_temp_text_channels_voice_channel_id
ON temp_text_channels(voice_channel_id);

CREATE TABLE IF NOT EXISTS temp_tts_settings (
  voice_channel_id TEXT PRIMARY KEY,
  guild_id TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 0,
  voice_key TEXT NOT NULL DEFAULT "default",
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (guild_id) REFERENCES guild_settings(guild_id),
  FOREIGN KEY (voice_channel_id) REFERENCES temp_channels(channel_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_temp_tts_settings_guild_id
ON temp_tts_settings(guild_id);

CREATE INDEX IF NOT EXISTS idx_temp_tts_settings_voice_channel_id
ON temp_tts_settings(voice_channel_id);

CREATE TABLE IF NOT EXISTS user_cooldowns (
  guild_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  action TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  PRIMARY KEY (guild_id, user_id, action)
);

CREATE TABLE IF NOT EXISTS metrics (
  guild_id TEXT PRIMARY KEY,
  channels_created INTEGER NOT NULL DEFAULT 0,
  creation_failed INTEGER NOT NULL DEFAULT 0,
  channels_deleted INTEGER NOT NULL DEFAULT 0,
  rename_used INTEGER NOT NULL DEFAULT 0,
  lock_used INTEGER NOT NULL DEFAULT 0,
  unlock_used INTEGER NOT NULL DEFAULT 0,
  limit_used INTEGER NOT NULL DEFAULT 0,
  support_used INTEGER NOT NULL DEFAULT 0,
  last_active_at TEXT
);
