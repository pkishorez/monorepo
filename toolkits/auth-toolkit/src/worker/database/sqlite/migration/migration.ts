import { fileURLToPath } from 'node:url';

export const AUTH_MIGRATIONS_TABLE = 'drizzle_migrations';

/** Drizzle v1 migrations shared by Alchemy D1 and in-memory SQLite. */
export const authMigrationsDir = fileURLToPath(
  new URL('./migrations', import.meta.url),
);
