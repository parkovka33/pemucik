import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { getDatabase, closeDatabase } from './database';

interface TableColumnInfo {
  name: string;
}

function listTableColumns(tableName: string): string[] {
  const database = getDatabase();
  const rows = database.prepare(`PRAGMA table_info(${tableName})`).all() as TableColumnInfo[];

  return rows.map((row) => row.name);
}

function ensureGuildSettingsColumns(): void {
  const database = getDatabase();
  const columns = new Set(listTableColumns('guild_settings'));

  if (!columns.has('editable_by_owner')) {
    database.exec('ALTER TABLE guild_settings ADD COLUMN editable_by_owner INTEGER NOT NULL DEFAULT 0');
  }

  if (!columns.has('permission_source')) {
    database.exec('ALTER TABLE guild_settings ADD COLUMN permission_source TEXT NOT NULL DEFAULT "category"');
  }

  if (!columns.has('default_bitrate')) {
    database.exec('ALTER TABLE guild_settings ADD COLUMN default_bitrate INTEGER NOT NULL DEFAULT 0');
  }

  if (!columns.has('interface_channel_id')) {
    database.exec('ALTER TABLE guild_settings ADD COLUMN interface_channel_id TEXT');
  }

  if (!columns.has('interface_message_id')) {
    database.exec('ALTER TABLE guild_settings ADD COLUMN interface_message_id TEXT');
  }
}

function runMigration(): void {
  const database = getDatabase();
  const schemaPath = resolve(process.cwd(), 'src/db/schema.sql');
  const schema = readFileSync(schemaPath, 'utf8');

  database.exec(schema);
  ensureGuildSettingsColumns();
}

try {
  runMigration();
  console.log('Database migration completed successfully.');
} finally {
  closeDatabase();
}
