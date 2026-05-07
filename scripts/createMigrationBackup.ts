import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, resolve } from 'node:path';

import Database from 'better-sqlite3';

import { getDatabasePath } from '../src/config/env';

interface BackupMetadata {
  createdAt: string;
  sourceDatabasePath: string;
  backupDatabaseFile: string;
  backupSha256: string;
  envFileIncluded: false;
  envFilePresent: boolean;
  restoreTargetPath: string;
}

function buildTimestamp(date: Date): string {
  return date.toISOString().replace(/:/g, '-').replace(/\.\d{3}Z$/, 'Z');
}

function sha256ForFile(filePath: string): string {
  return createHash('sha256').update(readFileSync(filePath)).digest('hex');
}

async function run(): Promise<void> {
  const sourceDatabasePath = resolve(process.cwd(), getDatabasePath());

  if (!existsSync(sourceDatabasePath)) {
    throw new Error(`Database file not found: ${sourceDatabasePath}`);
  }

  const timestamp = buildTimestamp(new Date());
  const backupDirectory = resolve(process.cwd(), 'backups', `migration-${timestamp}`);
  const backupDatabaseFile = basename(sourceDatabasePath);
  const backupDatabasePath = resolve(backupDirectory, backupDatabaseFile);
  const envPath = resolve(process.cwd(), '.env');

  mkdirSync(backupDirectory, { recursive: true });

  const database = new Database(sourceDatabasePath);

  try {
    // Use SQLite's backup API so the copy stays consistent even if WAL is enabled.
    await database.backup(backupDatabasePath);
  } finally {
    database.close();
  }

  const metadata: BackupMetadata = {
    createdAt: new Date().toISOString(),
    sourceDatabasePath,
    backupDatabaseFile,
    backupSha256: sha256ForFile(backupDatabasePath),
    envFileIncluded: false,
    envFilePresent: existsSync(envPath),
    restoreTargetPath: getDatabasePath(),
  };

  writeFileSync(resolve(backupDirectory, 'metadata.json'), `${JSON.stringify(metadata, null, 2)}\n`);
  writeFileSync(
    resolve(backupDirectory, 'RESTORE-NOTES.txt'),
    [
      `Backup created at: ${metadata.createdAt}`,
      `Database backup: ${backupDatabaseFile}`,
      `SHA-256: ${metadata.backupSha256}`,
      '',
      'Restore steps:',
      `1. Copy ${backupDatabaseFile} into the new server at ${metadata.restoreTargetPath}.`,
      '2. Copy your existing .env file separately. It is intentionally NOT included in this backup.',
      '3. Run npm install, npm run db:migrate, npm run build, and npm run commands:register on the new VPS.',
    ].join('\n'),
  );

  if (existsSync(resolve(process.cwd(), '.env.example'))) {
    copyFileSync(resolve(process.cwd(), '.env.example'), resolve(backupDirectory, '.env.example'));
  }

  console.log(`Migration backup created: ${backupDirectory}`);
  console.log(`Database copy: ${backupDatabasePath}`);
  console.log(`SHA-256: ${metadata.backupSha256}`);

  if (metadata.envFilePresent) {
    console.log('Reminder: copy .env manually to the new VPS. It was not included in the backup.');
  } else {
    console.log('Reminder: create a new .env on the new VPS from .env.example and your Discord app settings.');
  }
}

run().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Failed to create migration backup: ${message}`);
  process.exitCode = 1;
});
