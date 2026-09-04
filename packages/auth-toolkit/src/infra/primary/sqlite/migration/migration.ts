import { fileURLToPath } from 'node:url';

export const AUTH_MIGRATIONS_TABLE = 'drizzle_migrations';

/** Absolute path to the migrations this package ships for its fixed schema.
 * Every SQLite-dialect provider (D1, the in-memory
 * Provider, and any future one — Durable Object SQLite, say) applies these
 * same files. */
export const authMigrationsDir = fileURLToPath(
  new URL('./migrations', import.meta.url),
);
