-- Legacy shape explicitly supported by the previous conditional migration code.
CREATE TABLE guild_settings (
  guild_id TEXT PRIMARY KEY,
  category_id TEXT NOT NULL,
  generator_channel_id TEXT NOT NULL,
  default_name_template TEXT NOT NULL DEFAULT "{user}'s Room",
  default_user_limit INTEGER NOT NULL DEFAULT 0,
  language TEXT NOT NULL DEFAULT "en",
  max_temp_channels INTEGER NOT NULL DEFAULT 25,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE temp_channels (
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

CREATE TABLE temp_text_channels (
  text_channel_id TEXT PRIMARY KEY,
  voice_channel_id TEXT NOT NULL UNIQUE,
  guild_id TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (guild_id) REFERENCES guild_settings(guild_id)
);

CREATE TABLE user_cooldowns (
  guild_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  action TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  PRIMARY KEY (guild_id, user_id, action)
);

CREATE TABLE metrics (
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
