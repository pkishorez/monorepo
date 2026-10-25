import { mkdtempSync, rmSync, statSync } from 'node:fs';
import { hostname, tmpdir } from 'node:os';
import { join } from 'node:path';
import { Effect, Schema } from 'effect';
import { StdTable } from '@kestack/std-toolkit/db';
import { SQLite } from '@kestack/std-toolkit/db/sqlite';
import { makeNodeSQLite } from '@kestack/std-toolkit/db/sqlite/node';
import { afterEach, describe, expect, it } from 'vitest';
import { claim, forget, found } from '../index.js';
import { writeMachine } from '../machine-file.js';
import { takeLegacyMachine } from '../legacy.js';
import { ESchema } from '@kestack/std-toolkit/eschema';

const folders: Array<string> = [];
afterEach(() => {
  for (const made of folders.splice(0)) rmSync(made, { recursive: true });
});
const kept = () => {
  const made = mkdtempSync(join(tmpdir(), 'connect-machine-'));
  folders.push(made);
  return { file: join(made, 'machine.json'), db: join(made, 'connect.db') };
};

const ada = { id: 'u-ada', email: 'ada@example.com' };
const bob = { id: 'u-bob', email: 'bob@example.com' };

// ai-toolkit's table, spelled as ai-toolkit spelled it: what a moved
// database holds.
const machineTable = StdTable.make('ai-toolkit-machine')
  .primary('pk', 'sk')
  .build();
const stored = machineTable
  .singleEntity(
    ESchema.make('Machine', {
      machine: Schema.NullOr(
        Schema.Struct({
          id: Schema.String,
          name: Schema.String,
          key: Schema.String,
          owner: Schema.Struct({ id: Schema.String, email: Schema.String }),
        }),
      ),
    }).build(),
  )
  .default({ machine: null });

/** Puts `machine` in ai-toolkit's table on `db`, as a moved database holds it. */
const keepLegacy = (
  db: string,
  machine: Parameters<typeof stored.put>[0]['machine'],
) =>
  Effect.acquireUseRelease(
    Effect.sync(() => makeNodeSQLite({ path: db })),
    (database) =>
      SQLite.setup(machineTable, { database, mode: 'persistent' }).pipe(
        Effect.andThen(stored.put({ machine })),
        Effect.provide(SQLite.make(machineTable, { database }).layer),
        Effect.orDie,
      ),
    (database) => Effect.sync(() => database.close?.()),
  );

describe('machine.json is one Machine of one User', () => {
  it('makes the Machine once, 0600, then finds the same one', () =>
    Effect.runPromise(
      Effect.gen(function* () {
        const at = kept();
        const first = yield* claim({ ...at, owner: ada });
        expect(first.name).toBe(hostname());
        expect(first.key).toMatch(/^[A-Za-z0-9_-]{43}$/);
        expect(statSync(at.file).mode & 0o777).toBe(0o600);
        expect(yield* claim({ ...at, owner: ada })).toEqual(first);
      }),
    ));

  it('names a new Machine `firstName`, cut to 64 characters', () =>
    Effect.runPromise(
      Effect.gen(function* () {
        const made = yield* claim({
          ...kept(),
          owner: ada,
          firstName: `${'h'.repeat(60)} (main)`,
        });
        expect(made.name).toBe(`${'h'.repeat(60)} (ma`);
      }),
    ));

  it('keeps a name given, and never changes the id or key', () =>
    Effect.runPromise(
      Effect.gen(function* () {
        const at = kept();
        const first = yield* claim({ ...at, owner: ada });
        const renamed = yield* claim({ ...at, owner: ada, name: 'studio' });
        expect(renamed).toEqual({ ...first, name: 'studio' });
        expect(yield* claim({ ...at, owner: ada })).toEqual(renamed);
      }),
    ));

  it('refuses another User on a Machine owned by one', () =>
    Effect.runPromise(
      Effect.gen(function* () {
        const at = kept();
        yield* claim({ ...at, owner: ada });
        const refused = yield* Effect.flip(claim({ ...at, owner: bob }));
        expect(refused._tag).toBe('MachineOwnedByAnother');
        expect(refused.message).toContain('ada@example.com');
        expect(refused.message).toContain('ke-connect logout');
      }),
    ));

  it('is a new Machine after it is forgotten, for anyone', () =>
    Effect.runPromise(
      Effect.gen(function* () {
        const at = kept();
        const first = yield* claim({ ...at, owner: ada });
        yield* forget(at);
        expect(yield* found(at)).toBeNull();
        const next = yield* claim({ ...at, owner: bob });
        expect(next.id).not.toBe(first.id);
        expect(next.key).not.toBe(first.key);
      }),
    ));

  it('takes over the Machine ai-toolkit kept in a moved database, once', () =>
    Effect.runPromise(
      Effect.gen(function* () {
        const at = kept();
        const legacy = {
          id: 'm-old',
          name: 'laptop',
          key: 'k-old',
          owner: ada,
        };
        yield* keepLegacy(at.db, legacy);
        expect(yield* claim({ ...at, owner: ada })).toEqual({
          id: 'm-old',
          name: 'laptop',
          key: 'k-old',
        });
        expect(statSync(at.file).mode & 0o777).toBe(0o600);
        // The old record is nulled: forgetting leaves nothing to take again.
        yield* forget(at);
        const next = yield* claim({ ...at, owner: ada });
        expect(next.id).not.toBe('m-old');
      }),
    ));

  it('keeps ai-toolkit’s Machine until machine.json holds it', () =>
    Effect.runPromise(
      Effect.gen(function* () {
        const at = kept();
        const legacy = {
          id: 'm-old',
          name: 'laptop',
          key: 'k-old',
          owner: ada,
        };
        yield* keepLegacy(at.db, legacy);
        const cut = yield* Effect.exit(
          takeLegacyMachine(at.db, () => Effect.die('cut short')),
        );
        expect(cut._tag).toBe('Failure');
        expect((yield* claim({ ...at, owner: ada })).id).toBe('m-old');
      }),
    ));

  it('clears ai-toolkit’s Machine left behind by a take cut short, so logout never brings it back', () =>
    Effect.runPromise(
      Effect.gen(function* () {
        const at = kept();
        const legacy = {
          id: 'm-old',
          name: 'laptop',
          key: 'k-old',
          owner: ada,
        };
        yield* keepLegacy(at.db, legacy);
        // Cut short after machine.json was written, before the record was nulled.
        yield* writeMachine(at.file, legacy);
        expect((yield* claim({ ...at, owner: ada })).id).toBe('m-old');
        yield* forget(at);
        expect(yield* found(at)).toBeNull();
        expect((yield* claim({ ...at, owner: ada })).id).not.toBe('m-old');
      }),
    ));

  it('clears ai-toolkit’s Machine on logout too', () =>
    Effect.runPromise(
      Effect.gen(function* () {
        const at = kept();
        const legacy = {
          id: 'm-old',
          name: 'laptop',
          key: 'k-old',
          owner: ada,
        };
        yield* keepLegacy(at.db, legacy);
        yield* writeMachine(at.file, legacy);
        yield* forget(at);
        expect(yield* found(at)).toBeNull();
      }),
    ));
});
