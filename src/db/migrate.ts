import type Database from 'better-sqlite3';

import { closeDatabase, getDatabase } from './database';
import { runDatabaseMigrations, type MigrationRunResult } from './migrations';

export function migrateDatabase(database: Database.Database): MigrationRunResult {
  return runDatabaseMigrations(database);
}

function runConfiguredMigration(): void {
  const database = getDatabase();

  try {
    const result = migrateDatabase(database);
    const appliedVersions = result.applied.map((migration) => migration.version).join(', ') || 'none';

    console.log(`Database migration completed successfully. Applied versions: ${appliedVersions}.`);
  } finally {
    closeDatabase();
  }
}

if (require.main === module) {
  runConfiguredMigration();
}
