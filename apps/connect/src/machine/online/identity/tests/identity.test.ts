import { mkdtempSync, rmSync, statSync } from 'node:fs';
import { hostname, tmpdir } from 'node:os';
import { join } from 'node:path';
import { Effect } from 'effect';
import { afterEach, describe, expect, it } from 'vitest';
import { claim, forget, found } from '../index.js';

const folders: Array<string> = [];
afterEach(() => {
  for (const made of folders.splice(0)) rmSync(made, { recursive: true });
});
const kept = () => {
  const made = mkdtempSync(join(tmpdir(), 'connect-machine-'));
  folders.push(made);
  return { file: join(made, 'machine.json') };
};

const ada = { id: 'u-ada', email: 'ada@example.com' };
const bob = { id: 'u-bob', email: 'bob@example.com' };

describe('machine.json is one Machine of one User', () => {
  it('makes the Machine once, 0600, then finds the same one', () =>
    Effect.runPromise(
      Effect.gen(function* () {
        const at = kept();
        const first = yield* claim({ ...at, owner: ada });
        expect(first.name).toBe(hostname().split('.')[0]);
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

  it('shortens a kept name that has the whole of the host name', () =>
    Effect.runPromise(
      Effect.gen(function* () {
        const at = kept();
        const first = yield* claim({ ...at, owner: ada, name: 'x' });
        yield* claim({ ...at, owner: ada, name: `${hostname()} (main)` });
        const again = yield* claim({ ...at, owner: ada });
        expect(again).toEqual({
          ...first,
          name: `${hostname().split('.')[0]} (main)`,
        });
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
});
