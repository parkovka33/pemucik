import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { closeDatabase, getDatabase } from '../../src/db/database';

export function setupTestDatabase(): { cleanup: () => void } {
  closeDatabase();

  const tempDirectory = mkdtempSync(join(tmpdir(), 'pemucik-tests-'));
  const databasePath = join(tempDirectory, 'test.sqlite');
  const schemaPath = resolve(process.cwd(), 'src/db/schema.sql');
  const schema = readFileSync(schemaPath, 'utf8');
  const previousDatabasePath = process.env.DATABASE_PATH;

  process.env.DATABASE_PATH = databasePath;

  const database = getDatabase();
  database.exec(schema);

  return {
    cleanup: () => {
      closeDatabase();

      if (previousDatabasePath === undefined) {
        delete process.env.DATABASE_PATH;
      } else {
        process.env.DATABASE_PATH = previousDatabasePath;
      }

      rmSync(tempDirectory, { recursive: true, force: true });
    },
  };
}
