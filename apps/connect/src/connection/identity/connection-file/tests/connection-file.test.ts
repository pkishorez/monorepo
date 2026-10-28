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
  const made = mkdtempSync(join(tmpdir(), 'connect-connection-'));
  folders.push(made);
  return { file: join(made, 'connection.json') };
};

const ada = { id: 'u-ada', email: 'ada@example.com' };
const bob = { id: 'u-bob', email: 'bob@example.com' };
const cloud = 'https://connect.example';
const on = { cloud, startedAt: 1 };

describe('connection.json is one Connection of one User', () => {
  it('makes the Connection once, 0600, then finds the same one', () =>
    Effect.runPromise(
      Effect.gen(function* () {
        const at = kept();
        const first = yield* claim({ ...at, ...on, owner: ada });
        expect(first.name).toBe(hostname().split('.')[0]);
        expect(first.key).toMatch(/^[A-Za-z0-9_-]{43}$/);
        expect(statSync(at.file).mode & 0o777).toBe(0o600);
        expect(yield* claim({ ...at, ...on, owner: ada })).toEqual(first);
      }),
    ));

  it('names a new Connection `firstName`, cut to 64 characters', () =>
    Effect.runPromise(
      Effect.gen(function* () {
        const made = yield* claim({
          ...kept(),
          ...on,
          owner: ada,
          firstName: `${'h'.repeat(60)} (main)`,
        });
        expect(made.name).toBe(`${'h'.repeat(60)} (ma`);
      }),
    ));

  it('keeps its name, id and key, and when it last started', () =>
    Effect.runPromise(
      Effect.gen(function* () {
        const at = kept();
        const first = yield* claim({ ...at, ...on, owner: ada });
        const again = yield* claim({
          ...at,
          ...on,
          startedAt: 2,
          owner: ada,
          firstName: 'studio',
        });
        expect(again).toEqual(first);
        expect((yield* found(at))?.startedAt).toBe(2);
      }),
    ));

  it('refuses another Cloud Connect', () =>
    Effect.runPromise(
      Effect.gen(function* () {
        const at = kept();
        yield* claim({ ...at, ...on, owner: ada });
        const refused = yield* Effect.flip(
          claim({ ...at, ...on, cloud: 'https://other.example', owner: ada }),
        );
        expect(refused._tag).toBe('ConnectionOfAnotherCloud');
        expect(refused.message).toContain(`--cloud ${cloud}`);
      }),
    ));

  it('shortens a kept name that has the whole of the host name', () =>
    Effect.runPromise(
      Effect.gen(function* () {
        const at = kept();
        const first = yield* claim({
          ...at,
          ...on,
          owner: ada,
          firstName: `${hostname()} (main)`,
        });
        const again = yield* claim({ ...at, ...on, owner: ada });
        expect(again).toEqual({
          ...first,
          name: `${hostname().split('.')[0]} (main)`,
        });
      }),
    ));

  it('refuses another User on a Connection owned by one', () =>
    Effect.runPromise(
      Effect.gen(function* () {
        const at = kept();
        yield* claim({ ...at, ...on, owner: ada });
        const refused = yield* Effect.flip(claim({ ...at, ...on, owner: bob }));
        expect(refused._tag).toBe('ConnectionOwnedByAnother');
        expect(refused.message).toContain('ada@example.com');
        expect(refused.message).toContain('ke-connect remove');
      }),
    ));

  it('is a new Connection after it is forgotten, for anyone', () =>
    Effect.runPromise(
      Effect.gen(function* () {
        const at = kept();
        const first = yield* claim({ ...at, ...on, owner: ada });
        yield* forget(at);
        expect(yield* found(at)).toBeNull();
        const next = yield* claim({ ...at, ...on, owner: bob });
        expect(next.id).not.toBe(first.id);
        expect(next.key).not.toBe(first.key);
      }),
    ));
});
