import { NodeServices } from '@effect/platform-node';
import {
  MigrationError,
  readDrizzleDirRecords,
  runMigrations,
  type SqlExecutor,
} from 'alchemy/SQL/Migrations/index';
import Database from 'better-sqlite3';
import { readMigrationFiles } from 'drizzle-orm/migrator';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { Effect } from 'effect';
import { describe, expect, it, vi } from 'vitest';
import { d1PrimaryDatabaseResource } from '../d1/resource/resource.js';
import { AUTH_MIGRATIONS_TABLE, authMigrationsDir } from './migration.js';

const { databaseResource } = vi.hoisted(() => ({ databaseResource: vi.fn() }));
vi.mock('alchemy/Cloudflare', () => ({ D1: { Database: databaseResource } }));

describe('auth migrations', () => {
  it('wires the D1 resource to shared Drizzle v1 migrations', () => {
    d1PrimaryDatabaseResource('auth-db', { name: 'auth' });
    expect(databaseResource).toHaveBeenCalledWith('auth-db', {
      name: 'auth',
      migrations: { dir: authMigrationsDir, table: AUTH_MIGRATIONS_TABLE },
    });
  });

  it('applies the same schema through Alchemy and skips it on rerun', async () => {
    const sqlite = new Database(':memory:');
    const drizzleSqlite = new Database(':memory:');
    const batch = vi.fn((statements: ReadonlyArray<string>) =>
      Effect.try({
        try: () =>
          sqlite.transaction(() => {
            for (const statement of statements) sqlite.exec(statement);
          })(),
        catch: (cause) =>
          new MigrationError({ message: 'SQLite batch failed', cause }),
      }),
    );
    const executor: SqlExecutor = {
      dialect: 'sqlite',
      query: (sql, params = []) =>
        Effect.try({
          try: () =>
            sqlite.prepare(sql).all(...params) as Record<string, unknown>[],
          catch: (cause) =>
            new MigrationError({ message: 'SQLite query failed', cause }),
        }),
      batch,
    };
    const run = () =>
      Effect.runPromise(
        runMigrations({
          input: { dir: authMigrationsDir, table: AUTH_MIGRATIONS_TABLE },
          stamped: {},
          withExecutor: (apply) => apply(executor),
        }).pipe(Effect.provide(NodeServices.layer)),
      );

    try {
      const records = await Effect.runPromise(
        readDrizzleDirRecords(authMigrationsDir).pipe(
          Effect.provide(NodeServices.layer),
        ),
      );
      const drizzleRecords = readMigrationFiles({
        migrationsFolder: authMigrationsDir,
      });
      expect(records.length).toBeGreaterThan(0);
      expect(records.map(({ hash }) => hash)).toEqual(
        drizzleRecords.map(({ hash }) => hash),
      );

      await run();
      migrate(drizzle({ client: drizzleSqlite }), {
        migrationsFolder: authMigrationsDir,
      });
      const schemaSql = `select type, name, sql from sqlite_master
        where tbl_name in ('account', 'session', 'user', 'verification')
        order by type, name`;
      expect(sqlite.prepare(schemaSql).all()).toEqual(
        drizzleSqlite.prepare(schemaSql).all(),
      );
      const history = sqlite
        .prepare(`select * from ${AUTH_MIGRATIONS_TABLE}`)
        .all();
      expect(history).toHaveLength(records.length);
      batch.mockClear();

      await run();
      expect(batch).not.toHaveBeenCalled();
      expect(
        sqlite.prepare(`select * from ${AUTH_MIGRATIONS_TABLE}`).all(),
      ).toEqual(history);
    } finally {
      sqlite.close();
      drizzleSqlite.close();
    }
  });

  it('create the complete auth schema', () => {
    const sqlite = new Database(':memory:');

    try {
      migrate(drizzle({ client: sqlite }), {
        migrationsFolder: authMigrationsDir,
      });

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
