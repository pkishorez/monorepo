import Database from 'better-sqlite3';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { authMigrationsDir } from '../migration/index.js';
import { authSchema } from '../schema/index.js';

/**
 * An in-memory Primary Database Provider, migrated with the same .sql files
 * the D1 resource applies in production — for tests, not for deployment.
 */
export const memoryPrimaryDatabase = (): ReturnType<typeof drizzleAdapter> => {
  const sqlite = new Database(':memory:');
  const db = drizzle(sqlite, { schema: authSchema });
  migrate(db, { migrationsFolder: authMigrationsDir });
  return drizzleAdapter(db, { provider: 'sqlite', schema: authSchema });
};
