import { existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

import Database from 'better-sqlite3';

import { getDatabasePath } from '../config/env';

let databaseInstance: Database.Database | null = null;

function ensureDatabaseDirectory(databasePath: string): string {
  const resolvedPath = resolve(process.cwd(), databasePath);
  const directoryPath = dirname(resolvedPath);

  if (!existsSync(directoryPath)) {
    mkdirSync(directoryPath, { recursive: true });
  }

  return resolvedPath;
}

export function getDatabase(): Database.Database {
  if (databaseInstance) {
    return databaseInstance;
  }

  const filePath = ensureDatabaseDirectory(getDatabasePath());

  databaseInstance = new Database(filePath);
  databaseInstance.pragma('journal_mode = WAL');
  databaseInstance.pragma('foreign_keys = ON');

  return databaseInstance;
}

export function closeDatabase(): void {
  if (!databaseInstance) {
    return;
  }

  databaseInstance.close();
  databaseInstance = null;
}
