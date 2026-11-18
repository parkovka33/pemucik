import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { copyFileSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';

import Database from 'better-sqlite3';

import {
  DatabaseMigrationError,
  runDatabaseMigrations,
  type DatabaseMigration,
} from '../src/db/migrations';

interface CountRow {
  count: number;
}

interface NameRow {
  name: string;
}

function createTempDatabase(): {
  database: Database.Database;
  databasePath: string;
  tempDirectory: string;
  cleanup: () => void;
} {
  const tempDirectory = mkdtempSync(join(tmpdir(), 'pemucik-migrations-'));
  const databasePath = join(tempDirectory, 'database.sqlite');
  const database = new Database(databasePath);
  database.pragma('foreign_keys = ON');

  return {
    database,
    databasePath,
    tempDirectory,
    cleanup: () => {
      if (database.open) {
        database.close();
      }

      rmSync(tempDirectory, { recursive: true, force: true });
    },
  };
}

function loadFixture(database: Database.Database, fixtureName: string): void {
  const fixturePath = resolve(process.cwd(), 'tests', 'fixtures', fixtureName);
  database.exec(readFileSync(fixturePath, 'utf8'));
}

function listMigrationVersions(database: Database.Database): number[] {
  return (
    database.prepare('SELECT version FROM schema_migrations ORDER BY version').all() as {
      version: number;
    }[]
  ).map((row) => row.version);
}

function hasIndex(database: Database.Database, indexName: string): boolean {
  return (
    database
      .prepare("SELECT name FROM sqlite_master WHERE type = 'index' AND name = ?")
      .get(indexName) !== undefined
  );
}

test('migrations initialize a new database and repeated runs are idempotent', () => {
  const fixture = createTempDatabase();

  try {
    const first = runDatabaseMigrations(fixture.database);

    assert.deepEqual(
      first.applied.map((migration) => migration.version),
      [1, 2, 3, 4],
    );
    assert.deepEqual(listMigrationVersions(fixture.database), [1, 2, 3, 4]);
    assert.equal(hasIndex(fixture.database, 'idx_temp_channels_guild_owner'), true);
    assert.deepEqual(fixture.database.pragma('integrity_check'), [{ integrity_check: 'ok' }]);
    assert.deepEqual(fixture.database.pragma('foreign_key_check'), []);

    const second = runDatabaseMigrations(fixture.database);

    assert.deepEqual(second.applied, []);
    assert.deepEqual(
      second.alreadyApplied.map((migration) => migration.version),
      [1, 2, 3, 4],
    );
  } finally {
    fixture.cleanup();
  }
});

test('migrations adopt the Git-history core schema and preserve existing rows', () => {
  const fixture = createTempDatabase();

  try {
    loadFixture(fixture.database, 'schema-v1-core.sql');
    fixture.database
      .prepare(
        `INSERT INTO guild_settings (guild_id, category_id, generator_channel_id)
         VALUES ('guild-1', 'category-1', 'generator-1')`,
      )
      .run();
    fixture.database
      .prepare(
        `INSERT INTO temp_channels (channel_id, guild_id, owner_user_id, category_id)
         VALUES ('voice-1', 'guild-1', 'owner-1', 'category-1')`,
      )
      .run();

    const result = runDatabaseMigrations(fixture.database);

    assert.deepEqual(
      result.applied.map((migration) => migration.version),
      [2, 3, 4],
    );
    assert.equal(
      (fixture.database.prepare('SELECT COUNT(*) AS count FROM temp_channels').get() as CountRow).count,
      1,
    );
    assert.equal(
      (fixture.database
        .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'temp_tts_settings'")
        .get() as NameRow).name,
      'temp_tts_settings',
    );
  } finally {
    fixture.cleanup();
  }
});

test('migrations adopt the Git-history TTS schema without resetting settings', () => {
  const fixture = createTempDatabase();

  try {
    loadFixture(fixture.database, 'schema-v2-tts.sql');
    fixture.database
      .prepare(
        `INSERT INTO guild_settings (guild_id, category_id, generator_channel_id)
         VALUES ('guild-1', 'category-1', 'generator-1')`,
      )
      .run();
    fixture.database
      .prepare(
        `INSERT INTO temp_channels (channel_id, guild_id, owner_user_id, category_id)
         VALUES ('voice-1', 'guild-1', 'owner-1', 'category-1')`,
      )
      .run();
    fixture.database
      .prepare(
        `INSERT INTO temp_tts_settings (voice_channel_id, guild_id, enabled, voice_key)
         VALUES ('voice-1', 'guild-1', 1, 'test-voice')`,
      )
      .run();

    runDatabaseMigrations(fixture.database);

    assert.deepEqual(
      fixture.database
        .prepare('SELECT enabled, voice_key FROM temp_tts_settings WHERE voice_channel_id = ?')
        .get('voice-1'),
      { enabled: 1, voice_key: 'test-voice' },
    );
  } finally {
    fixture.cleanup();
  }
});

test('migrations normalize only legacy guild columns supported by the previous runner', () => {
  const fixture = createTempDatabase();

  try {
    loadFixture(fixture.database, 'schema-legacy-guild-settings.sql');
    fixture.database
      .prepare(
        `INSERT INTO guild_settings (guild_id, category_id, generator_channel_id)
         VALUES ('guild-1', 'category-1', 'generator-1')`,
      )
      .run();

    runDatabaseMigrations(fixture.database);

    assert.deepEqual(
      fixture.database
        .prepare(
          `SELECT editable_by_owner, permission_source, default_bitrate,
                  interface_channel_id, interface_message_id
           FROM guild_settings WHERE guild_id = ?`,
        )
        .get('guild-1'),
      {
        editable_by_owner: 0,
        permission_source: 'category',
        default_bitrate: 0,
        interface_channel_id: null,
        interface_message_id: null,
      },
    );
  } finally {
    fixture.cleanup();
  }
});

test('unknown legacy schemas are refused before a migration ledger is established', () => {
  const fixture = createTempDatabase();

  try {
    loadFixture(fixture.database, 'schema-v1-core.sql');
    fixture.database.exec('CREATE TABLE unexpected_feature (id TEXT PRIMARY KEY)');

    assert.throws(
      () => runDatabaseMigrations(fixture.database),
      (error: unknown) =>
        error instanceof DatabaseMigrationError && error.code === 'UNKNOWN_DATABASE_SCHEMA',
    );
    assert.equal(
      fixture.database
        .prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'schema_migrations'")
        .get(),
      undefined,
    );
  } finally {
    fixture.cleanup();
  }
});

test('contradictory legacy foreign keys are refused instead of being guessed', () => {
  const fixture = createTempDatabase();

  try {
    const fixturePath = resolve(process.cwd(), 'tests', 'fixtures', 'schema-v1-core.sql');
    const contradictorySchema = readFileSync(fixturePath, 'utf8').replace(
      '  user_limit INTEGER NOT NULL DEFAULT 0,\n  FOREIGN KEY (guild_id) REFERENCES guild_settings(guild_id)',
      '  user_limit INTEGER NOT NULL DEFAULT 0',
    );
    fixture.database.exec(contradictorySchema);

    assert.throws(
      () => runDatabaseMigrations(fixture.database),
      (error: unknown) =>
        error instanceof DatabaseMigrationError && error.code === 'UNKNOWN_DATABASE_SCHEMA',
    );
    assert.equal(
      fixture.database
        .prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'schema_migrations'")
        .get(),
      undefined,
    );
  } finally {
    fixture.cleanup();
  }
});

test('duplicate ownership blocks the unique-index migration without deleting rows', () => {
  const fixture = createTempDatabase();

  try {
    loadFixture(fixture.database, 'schema-v2-tts.sql');
    fixture.database
      .prepare(
        `INSERT INTO guild_settings (guild_id, category_id, generator_channel_id)
         VALUES ('guild-1', 'category-1', 'generator-1')`,
      )
      .run();
    const insert = fixture.database.prepare(
      `INSERT INTO temp_channels (channel_id, guild_id, owner_user_id, category_id)
       VALUES (?, 'guild-1', 'owner-1', 'category-1')`,
    );
    insert.run('voice-1');
    insert.run('voice-2');

    assert.throws(
      () => runDatabaseMigrations(fixture.database),
      (error: unknown) =>
        error instanceof DatabaseMigrationError && error.code === 'DUPLICATE_TEMP_CHANNEL_OWNER',
    );
    assert.equal(
      (fixture.database.prepare('SELECT COUNT(*) AS count FROM temp_channels').get() as CountRow).count,
      2,
    );
    assert.deepEqual(listMigrationVersions(fixture.database), [1, 2, 3]);
    assert.equal(hasIndex(fixture.database, 'idx_temp_channels_guild_owner'), false);
  } finally {
    fixture.cleanup();
  }
});

test('a failed migration rolls back its schema work and ledger entry', () => {
  const fixture = createTempDatabase();
  const failingMigrations: readonly DatabaseMigration[] = [
    {
      version: 1,
      name: 'failure_probe',
      up: (database) => {
        database.exec('CREATE TABLE failure_probe (id TEXT PRIMARY KEY)');
        throw new Error('injected migration failure');
      },
    },
  ];

  try {
    assert.throws(() => runDatabaseMigrations(fixture.database, failingMigrations), /injected migration failure/);
    assert.equal(
      fixture.database
        .prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'failure_probe'")
        .get(),
      undefined,
    );
    assert.deepEqual(listMigrationVersions(fixture.database), []);
  } finally {
    fixture.cleanup();
  }
});

test('migration runner surfaces a closed database connection without opening another path', () => {
  const fixture = createTempDatabase();

  try {
    fixture.database.close();
    assert.throws(
      () => runDatabaseMigrations(fixture.database),
      /database connection is not open/i,
    );
  } finally {
    fixture.cleanup();
  }
});

test('backup hash verification and restoration preserve migrated data', async () => {
  const fixture = createTempDatabase();

  try {
    runDatabaseMigrations(fixture.database);
    fixture.database
      .prepare(
        `INSERT INTO guild_settings (guild_id, category_id, generator_channel_id)
         VALUES ('guild-1', 'category-1', 'generator-1')`,
      )
      .run();

    const backupPath = join(fixture.tempDirectory, 'backup.sqlite');
    const restorePath = join(fixture.tempDirectory, 'restored.sqlite');

    await fixture.database.backup(backupPath);
    const backupHash = createHash('sha256').update(readFileSync(backupPath)).digest('hex');

    copyFileSync(backupPath, restorePath);
    const restoredHash = createHash('sha256').update(readFileSync(restorePath)).digest('hex');
    assert.equal(restoredHash, backupHash);

    const restored = new Database(restorePath, { readonly: true });

    try {
      assert.deepEqual(restored.pragma('integrity_check'), [{ integrity_check: 'ok' }]);
      assert.equal(
        (restored.prepare('SELECT COUNT(*) AS count FROM guild_settings').get() as CountRow).count,
        1,
      );
      assert.deepEqual(listMigrationVersions(restored), [1, 2, 3, 4]);
    } finally {
      restored.close();
    }
  } finally {
    fixture.cleanup();
  }
});
