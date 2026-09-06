import Database from 'better-sqlite3';
import { drizzleAdapter } from '@better-auth/drizzle-adapter/relations-v2';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { authMigrationsDir } from '../migration/index.js';
import { authRelations, authSchema } from '../schema/index.js';

/**
 * An in-memory Primary Database Provider, migrated with the same .sql files
 * the D1 resource applies in production — for tests, not for deployment.
 */
export const memoryPrimaryDatabase = (): ReturnType<typeof drizzleAdapter> => {
  const sqlite = new Database(':memory:');
  const db = drizzle({ client: sqlite, relations: authRelations });
  migrate(db, { migrationsFolder: authMigrationsDir });
  return drizzleAdapter(db, { provider: 'sqlite', schema: authSchema });
};
