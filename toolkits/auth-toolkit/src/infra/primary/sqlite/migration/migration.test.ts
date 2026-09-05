import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { describe, expect, it } from 'vitest';
import { authMigrationsDir } from './migration.js';

describe('auth migrations', () => {
  it('create the complete auth schema', () => {
    const sqlite = new Database(':memory:');

    try {
      migrate(drizzle(sqlite), { migrationsFolder: authMigrationsDir });

      const tables = sqlite
        .prepare(
          `select name from sqlite_master
           where type = 'table'
             and name in ('account', 'session', 'user', 'verification')
           order by name`,
        )
        .all() as { name: string }[];

      expect(tables.map(({ name }) => name)).toEqual([
        'account',
        'session',
        'user',
        'verification',
      ]);
    } finally {
      sqlite.close();
    }
  });
});
