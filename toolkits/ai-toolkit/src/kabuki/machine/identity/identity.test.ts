import { mkdtempSync, rmSync } from 'node:fs';
import { hostname, tmpdir } from 'node:os';
import { join } from 'node:path';
import { Effect } from 'effect';
import { afterEach, describe, expect, it } from 'vitest';
import { claim, forget } from './index.js';

const folders: Array<string> = [];
afterEach(() => {
  for (const made of folders.splice(0)) rmSync(made, { recursive: true });
});
const dbFile = () => {
  const made = mkdtempSync(join(tmpdir(), 'ai-machine-'));
  folders.push(made);
  return join(made, 'ai.db');
};

const ada = { id: 'u-ada', email: 'ada@example.com' };
const bob = { id: 'u-bob', email: 'bob@example.com' };

describe('a database file is one Machine of one User', () => {
  it('makes the Machine once, then finds the same one', () =>
    Effect.runPromise(
      Effect.gen(function* () {
        const db = dbFile();
        const first = yield* claim({ db, owner: ada });
        expect(first.name).toBe(hostname());
        expect(first.key).toMatch(/^[A-Za-z0-9_-]{43}$/);
        expect(yield* claim({ db, owner: ada })).toEqual(first);
      }),
    ));

  it('keeps a name given, and never changes the id or key', () =>
    Effect.runPromise(
      Effect.gen(function* () {
        const db = dbFile();
        const first = yield* claim({ db, owner: ada });
        const renamed = yield* claim({ db, owner: ada, name: 'studio' });
        expect(renamed).toEqual({ ...first, name: 'studio' });
        expect(yield* claim({ db, owner: ada })).toEqual(renamed);
      }),
    ));

  it('refuses another User on a file owned by one', () =>
    Effect.runPromise(
      Effect.gen(function* () {
        const db = dbFile();
        yield* claim({ db, owner: ada });
        const refused = yield* Effect.flip(claim({ db, owner: bob }));
        expect(refused._tag).toBe('MachineOwnedByAnother');
        expect(refused.message).toContain('ada@example.com');
        expect(refused.message).toContain('--db');
      }),
    ));

  it('is a new Machine after it is forgotten, for anyone', () =>
    Effect.runPromise(
      Effect.gen(function* () {
        const db = dbFile();
        const first = yield* claim({ db, owner: ada });
        yield* forget(db);
        const next = yield* claim({ db, owner: bob });
        expect(next.id).not.toBe(first.id);
        expect(next.key).not.toBe(first.key);
      }),
    ));
});
