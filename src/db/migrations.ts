import type Database from 'better-sqlite3';

export interface DatabaseMigration {
  readonly version: number;
  readonly name: string;
  readonly up: (database: Database.Database) => void;
}

export interface AppliedMigration {
  version: number;
  name: string;
  appliedAt: string;
}

export interface MigrationRunResult {
  applied: AppliedMigration[];
  alreadyApplied: AppliedMigration[];
}

export class DatabaseMigrationError extends Error {
  public constructor(
    public readonly code:
      | 'DUPLICATE_MIGRATION_VERSION'
      | 'DUPLICATE_MIGRATION_NAME'
      | 'INVALID_MIGRATION_ORDER'
      | 'UNKNOWN_DATABASE_SCHEMA'
      | 'INVALID_MIGRATION_LEDGER'
      | 'DUPLICATE_TEMP_CHANNEL_OWNER'
      | 'DATABASE_INTEGRITY_FAILED'
      | 'DATABASE_FOREIGN_KEYS_FAILED',
    message: string,
  ) {
    super(message);
    this.name = 'DatabaseMigrationError';
  }
}

interface TableInfoRow {
  name: string;
  pk: number;
}

interface IndexListRow {
  name: string;
  unique: number;
}

interface ForeignKeyRow {
  table: string;
  from: string;
  to: string;
  on_delete: string;
}

interface IntegrityCheckRow {
  integrity_check: string;
}

interface LedgerRow {
  version: number;
  name: string;
  applied_at: string;
}

interface DuplicateOwnerRow {
  guild_id: string;
  owner_user_id: string;
  duplicate_count: number;
}

const CORE_SCHEMA_SQL = `
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
`;

const TEMP_TTS_SCHEMA_SQL = `
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
`;

const LEDGER_SCHEMA_SQL = `
CREATE TABLE schema_migrations (
  version INTEGER PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
`;

const KNOWN_APPLICATION_TABLES = new Set([
  'guild_settings',
  'metrics',
  'temp_channels',
  'temp_text_channels',
  'temp_tts_settings',
  'user_cooldowns',
]);

const REQUIRED_LEGACY_TABLES = [
  'guild_settings',
  'metrics',
  'temp_channels',
  'temp_text_channels',
  'user_cooldowns',
] as const;

const EXPECTED_COLUMNS: Readonly<Record<string, readonly string[]>> = {
  guild_settings: [
    'guild_id',
    'category_id',
    'generator_channel_id',
    'editable_by_owner',
    'permission_source',
    'default_name_template',
    'default_user_limit',
    'default_bitrate',
    'language',
    'max_temp_channels',
    'interface_channel_id',
    'interface_message_id',
    'created_at',
    'updated_at',
  ],
  temp_channels: [
    'channel_id',
    'guild_id',
    'owner_user_id',
    'category_id',
    'created_at',
    'last_active_at',
    'is_locked',
    'user_limit',
  ],
  temp_text_channels: [
    'text_channel_id',
    'voice_channel_id',
    'guild_id',
    'created_at',
    'updated_at',
  ],
  temp_tts_settings: [
    'voice_channel_id',
    'guild_id',
    'enabled',
    'voice_key',
    'created_at',
    'updated_at',
  ],
  user_cooldowns: ['guild_id', 'user_id', 'action', 'expires_at'],
  metrics: [
    'guild_id',
    'channels_created',
    'creation_failed',
    'channels_deleted',
    'rename_used',
    'lock_used',
    'unlock_used',
    'limit_used',
    'support_used',
    'last_active_at',
  ],
};

const OPTIONAL_LEGACY_GUILD_SETTINGS_COLUMNS = new Set([
  'editable_by_owner',
  'permission_source',
  'default_bitrate',
  'interface_channel_id',
  'interface_message_id',
]);

function quoteIdentifier(identifier: string): string {
  return `"${identifier.replaceAll('"', '""')}"`;
}

function tableExists(database: Database.Database, tableName: string): boolean {
  return database
    .prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?")
    .get(tableName) !== undefined;
}

function listApplicationTables(database: Database.Database): string[] {
  const rows = database
    .prepare(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name <> 'schema_migrations' ORDER BY name",
    )
    .all() as TableInfoRow[];

  return rows.map((row) => row.name);
}

function listTableColumns(database: Database.Database, tableName: string): string[] {
  const rows = database
    .prepare(`PRAGMA table_info(${quoteIdentifier(tableName)})`)
    .all() as TableInfoRow[];

  return rows.map((row) => row.name);
}

function listPrimaryKeyColumns(database: Database.Database, tableName: string): string[] {
  const rows = database
    .prepare(`PRAGMA table_info(${quoteIdentifier(tableName)})`)
    .all() as TableInfoRow[];

  return rows
    .filter((row) => row.pk > 0)
    .sort((left, right) => left.pk - right.pk)
    .map((row) => row.name);
}

function hasIndexForColumns(
  database: Database.Database,
  tableName: string,
  columns: readonly string[],
  requireUnique: boolean,
): boolean {
  const indexes = database
    .prepare(`PRAGMA index_list(${quoteIdentifier(tableName)})`)
    .all() as IndexListRow[];

  return indexes.some((index) => {
    if (requireUnique && index.unique !== 1) {
      return false;
    }

    const indexColumns = (
      database.prepare(`PRAGMA index_info(${quoteIdentifier(index.name)})`).all() as TableInfoRow[]
    ).map((row) => row.name);

    return indexColumns.length === columns.length
      && indexColumns.every((column, position) => column === columns[position]);
  });
}

function validateKeysAndForeignKeys(database: Database.Database, tables: readonly string[]): void {
  const expectedPrimaryKeys: Readonly<Record<string, readonly string[]>> = {
    guild_settings: ['guild_id'],
    temp_channels: ['channel_id'],
    temp_text_channels: ['text_channel_id'],
    temp_tts_settings: ['voice_channel_id'],
    user_cooldowns: ['guild_id', 'user_id', 'action'],
    metrics: ['guild_id'],
  };

  for (const table of tables) {
    const expected = expectedPrimaryKeys[table];

    if (expected && !hasExactValues(listPrimaryKeyColumns(database, table), expected)) {
      throw new DatabaseMigrationError(
        'UNKNOWN_DATABASE_SCHEMA',
        `Table ${table} has an unsupported primary key.`,
      );
    }
  }

  if (!hasIndexForColumns(database, 'temp_text_channels', ['voice_channel_id'], true)) {
    throw new DatabaseMigrationError(
      'UNKNOWN_DATABASE_SCHEMA',
      'Table temp_text_channels is missing the known unique voice_channel_id constraint.',
    );
  }

  const expectedForeignKeys: Array<{
    tableName: string;
    from: string;
    referencedTable: string;
    to: string;
    onDelete?: string;
  }> = [
    { tableName: 'temp_channels', from: 'guild_id', referencedTable: 'guild_settings', to: 'guild_id' },
    { tableName: 'temp_text_channels', from: 'guild_id', referencedTable: 'guild_settings', to: 'guild_id' },
  ];

  if (tables.includes('temp_tts_settings')) {
    expectedForeignKeys.push(
      { tableName: 'temp_tts_settings', from: 'guild_id', referencedTable: 'guild_settings', to: 'guild_id' },
      {
        tableName: 'temp_tts_settings',
        from: 'voice_channel_id',
        referencedTable: 'temp_channels',
        to: 'channel_id',
        onDelete: 'CASCADE',
      },
    );
  }

  for (const expected of expectedForeignKeys) {
    const foreignKeys = database
      .prepare(`PRAGMA foreign_key_list(${quoteIdentifier(expected.tableName)})`)
      .all() as ForeignKeyRow[];
    const matches = foreignKeys.some((foreignKey) =>
      foreignKey.from === expected.from
      && foreignKey.table === expected.referencedTable
      && foreignKey.to === expected.to
      && (expected.onDelete === undefined || foreignKey.on_delete === expected.onDelete)
    );

    if (!matches) {
      throw new DatabaseMigrationError(
        'UNKNOWN_DATABASE_SCHEMA',
        `Table ${expected.tableName} is missing the known foreign key for ${expected.from}.`,
      );
    }
  }
}

function hasExactValues(actual: readonly string[], expected: readonly string[]): boolean {
  return actual.length === expected.length
    && actual.every((value, position) => value === expected[position]);
}

function validateTableColumns(
  database: Database.Database,
  tableName: string,
  allowMissingLegacyGuildSettingsColumns: boolean,
): void {
  const expectedColumns = EXPECTED_COLUMNS[tableName];

  if (!expectedColumns) {
    throw new DatabaseMigrationError(
      'UNKNOWN_DATABASE_SCHEMA',
      `No known schema definition exists for table ${tableName}.`,
    );
  }

  const actualColumns = listTableColumns(database, tableName);
  const actualSet = new Set(actualColumns);
  const expectedSet = new Set(expectedColumns);
  const unexpected = actualColumns.filter((column) => !expectedSet.has(column));
  const missing = expectedColumns.filter((column) => !actualSet.has(column));
  const allowedMissing =
    allowMissingLegacyGuildSettingsColumns && tableName === 'guild_settings'
      ? missing.filter((column) => OPTIONAL_LEGACY_GUILD_SETTINGS_COLUMNS.has(column))
      : [];
  const disallowedMissing = missing.filter((column) => !allowedMissing.includes(column));

  if (unexpected.length > 0 || disallowedMissing.length > 0) {
    throw new DatabaseMigrationError(
      'UNKNOWN_DATABASE_SCHEMA',
      `Table ${tableName} has an unsupported shape. Missing: ${disallowedMissing.join(', ') || 'none'}; unexpected: ${unexpected.join(', ') || 'none'}.`,
    );
  }
}

function validateKnownSchema(
  database: Database.Database,
  options: { allowMissingTts: boolean; allowMissingLegacyGuildSettingsColumns: boolean },
): void {
  const tables = listApplicationTables(database);
  const unexpectedTables = tables.filter((table) => !KNOWN_APPLICATION_TABLES.has(table));

  if (unexpectedTables.length > 0) {
    throw new DatabaseMigrationError(
      'UNKNOWN_DATABASE_SCHEMA',
      `Database contains unsupported application tables: ${unexpectedTables.join(', ')}.`,
    );
  }

  const missingRequiredTables = REQUIRED_LEGACY_TABLES.filter((table) => !tables.includes(table));

  if (missingRequiredTables.length > 0) {
    throw new DatabaseMigrationError(
      'UNKNOWN_DATABASE_SCHEMA',
      `Database is missing required tables: ${missingRequiredTables.join(', ')}.`,
    );
  }

  if (!options.allowMissingTts && !tables.includes('temp_tts_settings')) {
    throw new DatabaseMigrationError(
      'UNKNOWN_DATABASE_SCHEMA',
      'Database is missing required table temp_tts_settings.',
    );
  }

  for (const table of tables) {
    validateTableColumns(database, table, options.allowMissingLegacyGuildSettingsColumns);
  }

  validateKeysAndForeignKeys(database, tables);
}

function addColumnIfMissing(database: Database.Database, tableName: string, columnName: string, sql: string): void {
  const columns = new Set(listTableColumns(database, tableName));

  if (!columns.has(columnName)) {
    database.exec(sql);
  }
}

function normalizeLegacyGuildSettings(database: Database.Database): void {
  addColumnIfMissing(
    database,
    'guild_settings',
    'editable_by_owner',
    'ALTER TABLE guild_settings ADD COLUMN editable_by_owner INTEGER NOT NULL DEFAULT 0',
  );
  addColumnIfMissing(
    database,
    'guild_settings',
    'permission_source',
    'ALTER TABLE guild_settings ADD COLUMN permission_source TEXT NOT NULL DEFAULT "category"',
  );
  addColumnIfMissing(
    database,
    'guild_settings',
    'default_bitrate',
    'ALTER TABLE guild_settings ADD COLUMN default_bitrate INTEGER NOT NULL DEFAULT 0',
  );
  addColumnIfMissing(
    database,
    'guild_settings',
    'interface_channel_id',
    'ALTER TABLE guild_settings ADD COLUMN interface_channel_id TEXT',
  );
  addColumnIfMissing(
    database,
    'guild_settings',
    'interface_message_id',
    'ALTER TABLE guild_settings ADD COLUMN interface_message_id TEXT',
  );
  database.exec(`
    CREATE INDEX IF NOT EXISTS idx_temp_channels_guild_id ON temp_channels(guild_id);
    CREATE INDEX IF NOT EXISTS idx_temp_channels_owner_user_id ON temp_channels(owner_user_id);
    CREATE INDEX IF NOT EXISTS idx_temp_text_channels_guild_id ON temp_text_channels(guild_id);
    CREATE INDEX IF NOT EXISTS idx_temp_text_channels_voice_channel_id ON temp_text_channels(voice_channel_id);
  `);
}

function assertNoDuplicateOwners(database: Database.Database): void {
  const duplicates = database
    .prepare(
      `SELECT guild_id, owner_user_id, COUNT(*) AS duplicate_count
       FROM temp_channels
       GROUP BY guild_id, owner_user_id
       HAVING COUNT(*) > 1
       ORDER BY guild_id, owner_user_id`,
    )
    .all() as DuplicateOwnerRow[];

  if (duplicates.length === 0) {
    return;
  }

  const summary = duplicates
    .map((row) => `${row.guild_id}/${row.owner_user_id} (${row.duplicate_count})`)
    .join(', ');

  throw new DatabaseMigrationError(
    'DUPLICATE_TEMP_CHANNEL_OWNER',
    `Cannot add unique temp-channel ownership index because duplicate owners exist: ${summary}. No rows were changed.`,
  );
}

export const databaseMigrations: readonly DatabaseMigration[] = Object.freeze([
  {
    version: 1,
    name: 'baseline_core_schema',
    up: (database) => {
      database.exec(CORE_SCHEMA_SQL);
    },
  },
  {
    version: 2,
    name: 'normalize_legacy_guild_settings',
    up: (database) => {
      normalizeLegacyGuildSettings(database);
    },
  },
  {
    version: 3,
    name: 'temp_tts_settings',
    up: (database) => {
      database.exec(TEMP_TTS_SCHEMA_SQL);
    },
  },
  {
    version: 4,
    name: 'unique_temp_channel_owner',
    up: (database) => {
      assertNoDuplicateOwners(database);
      database.exec(
        'CREATE UNIQUE INDEX IF NOT EXISTS idx_temp_channels_guild_owner ON temp_channels(guild_id, owner_user_id)',
      );
    },
  },
]);

function validateMigrationDefinitions(migrations: readonly DatabaseMigration[]): void {
  const versions = new Set<number>();
  const names = new Set<string>();
  let previousVersion = 0;

  for (const migration of migrations) {
    if (versions.has(migration.version)) {
      throw new DatabaseMigrationError(
        'DUPLICATE_MIGRATION_VERSION',
        `Migration version ${migration.version} is defined more than once.`,
      );
    }

    if (names.has(migration.name)) {
      throw new DatabaseMigrationError(
        'DUPLICATE_MIGRATION_NAME',
        `Migration name ${migration.name} is defined more than once.`,
      );
    }

    if (!Number.isInteger(migration.version) || migration.version <= previousVersion) {
      throw new DatabaseMigrationError(
        'INVALID_MIGRATION_ORDER',
        `Migration ${migration.name} has invalid ordered version ${migration.version}.`,
      );
    }

    versions.add(migration.version);
    names.add(migration.name);
    previousVersion = migration.version;
  }
}

function readLedger(database: Database.Database): AppliedMigration[] {
  const rows = database
    .prepare('SELECT version, name, applied_at FROM schema_migrations ORDER BY version')
    .all() as LedgerRow[];

  return rows.map((row) => ({
    version: row.version,
    name: row.name,
    appliedAt: row.applied_at,
  }));
}

function validateLedger(
  applied: readonly AppliedMigration[],
  migrations: readonly DatabaseMigration[],
): void {
  for (let index = 0; index < applied.length; index += 1) {
    const ledgerEntry = applied[index];
    const migration = migrations[index];

    if (!ledgerEntry || !migration || ledgerEntry.version !== migration.version || ledgerEntry.name !== migration.name) {
      throw new DatabaseMigrationError(
        'INVALID_MIGRATION_LEDGER',
        'Migration ledger is not an exact prefix of the configured ordered migrations.',
      );
    }
  }
}

function createLedger(database: Database.Database): void {
  database.exec(LEDGER_SCHEMA_SQL);
}

function insertLedgerEntry(database: Database.Database, migration: DatabaseMigration): AppliedMigration {
  database
    .prepare('INSERT INTO schema_migrations (version, name) VALUES (?, ?)')
    .run(migration.version, migration.name);

  const row = database
    .prepare('SELECT version, name, applied_at FROM schema_migrations WHERE version = ?')
    .get(migration.version) as LedgerRow;

  return {
    version: row.version,
    name: row.name,
    appliedAt: row.applied_at,
  };
}

function validateIntegrity(database: Database.Database): void {
  const integrityRows = database.pragma('integrity_check') as IntegrityCheckRow[];
  const failures = integrityRows.filter((row) => row.integrity_check !== 'ok');

  if (failures.length > 0) {
    throw new DatabaseMigrationError(
      'DATABASE_INTEGRITY_FAILED',
      `SQLite integrity check failed: ${failures.map((row) => row.integrity_check).join('; ')}`,
    );
  }

  const foreignKeyFailures = database.pragma('foreign_key_check') as Record<string, unknown>[];

  if (foreignKeyFailures.length > 0) {
    throw new DatabaseMigrationError(
      'DATABASE_FOREIGN_KEYS_FAILED',
      `SQLite foreign-key check reported ${foreignKeyFailures.length} violation(s).`,
    );
  }
}

export function runDatabaseMigrations(
  database: Database.Database,
  migrations: readonly DatabaseMigration[] = databaseMigrations,
): MigrationRunResult {
  validateMigrationDefinitions(migrations);
  database.pragma('foreign_keys = ON');

  const applicationTables = listApplicationTables(database);
  const ledgerExists = tableExists(database, 'schema_migrations');

  if (!ledgerExists && applicationTables.length > 0) {
    validateKnownSchema(database, {
      allowMissingTts: true,
      allowMissingLegacyGuildSettingsColumns: true,
    });

    const baseline = migrations[0];

    if (!baseline) {
      throw new DatabaseMigrationError(
        'INVALID_MIGRATION_ORDER',
        'At least one migration is required to adopt an existing database.',
      );
    }

    database.transaction(() => {
      createLedger(database);
      insertLedgerEntry(database, baseline);
    }).immediate();
  } else if (!ledgerExists) {
    createLedger(database);
  } else if (applicationTables.length > 0) {
    validateKnownSchema(database, {
      allowMissingTts: true,
      allowMissingLegacyGuildSettingsColumns: true,
    });
  }

  const alreadyApplied = readLedger(database);
  validateLedger(alreadyApplied, migrations);

  const applied: AppliedMigration[] = [];

  for (const migration of migrations.slice(alreadyApplied.length)) {
    const applyMigration = database.transaction(() => {
      migration.up(database);
      return insertLedgerEntry(database, migration);
    });

    applied.push(applyMigration.immediate());
  }

  if (migrations === databaseMigrations) {
    validateKnownSchema(database, {
      allowMissingTts: false,
      allowMissingLegacyGuildSettingsColumns: false,
    });

    if (!hasIndexForColumns(database, 'temp_channels', ['guild_id', 'owner_user_id'], true)) {
      throw new DatabaseMigrationError(
        'UNKNOWN_DATABASE_SCHEMA',
        'Database is missing the required unique temp-channel guild-owner index.',
      );
    }
  }

  validateIntegrity(database);

  return {
    applied,
    alreadyApplied,
  };
}
