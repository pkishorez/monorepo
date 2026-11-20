import type { D1Database } from '@cloudflare/workers-types';
import { Effect, Exit, Schema } from 'effect';
import { Miniflare } from 'miniflare';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { EntityESchema } from '../../../eschema/index.js';
import { StdTable } from '../../../db/index.js';
import { makeD1SQLite } from '../../../db/sqlite/drivers/d1/index.js';
import { SQLite } from '../../../db/sqlite/index.js';
import { TableSnapshot } from '../../../snapshot/index.js';
import { LegacySQL } from '../legacy.js';

let miniflare: Miniflare;
let binding: D1Database;
let driver: ReturnType<typeof makeD1SQLite>;

beforeAll(async () => {
  miniflare = new Miniflare({
    modules: true,
    script: 'export default { fetch() { return new Response("D1 tests"); } }',
    compatibilityDate: '2026-07-30',
    d1Databases: ['DB'],
  });
  binding = await miniflare.getD1Database('DB');
  driver = makeD1SQLite({ database: binding });
}, 30_000);

afterAll(async () => {
  await miniflare?.dispose();
});

describe('2026-11 stored contract on D1', () => {
  it('migrates a table kept under _std_contract, then refuses a breaking change against it', async () => {
    const tasks = (title: Schema.Codec<string, string>) => {
      const table = StdTable.make('tasks').primary('pk', 'sk').build();
      table
        .entity(EntityESchema.make('Task', 'taskId', { title }).build())
        .primary()
        .build();
      return table;
    };
    const v1 = tasks(Schema.String);
    const config = {
      database: driver,
      tableName: 'migrated_tasks',
      mode: 'persistent' as const,
    };
    // As the earlier release left it: the table, a row, and its contract row.
    await Effect.runPromise(SQLite.setup(v1, config));
    await binding.exec(
      "DELETE FROM migrated_tasks WHERE substr(_e, 1, 2) = '__'",
    );
    const snapshot = TableSnapshot.capture(v1);
    const old = await Effect.runPromise(
      TableSnapshot.serialize({
        ...snapshot,
        entities: snapshot.entities.filter(
          ({ name }) => !name.startsWith('__'),
        ),
        schemas: snapshot.schemas.filter(
          ({ identity }) => !identity.startsWith('__'),
        ),
      }),
    );
    await Effect.runPromise(driver.run(LegacySQL.create));
    await Effect.runPromise(
      driver.run(LegacySQL.insert, [
        'migrated_tasks',
        'persistent',
        'old-hash',
        JSON.stringify(old),
      ]),
    );

    const refused = await Effect.runPromise(
      Effect.exit(
        SQLite.setup(tasks(Schema.String.check(Schema.isMaxLength(3))), config),
      ),
    );
    expect(Exit.isFailure(refused) && String(refused.cause)).toMatch(
      /SetupRefused|cannot be set up/,
    );
    expect(
      await Effect.runPromise(
        driver.all(
          "SELECT name FROM sqlite_master WHERE name = '_std_contract'",
        ),
      ),
    ).toEqual([]);
    await Effect.runPromise(SQLite.setup(v1, config));
  });
});
