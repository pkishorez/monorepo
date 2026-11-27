import { mkdtempSync, rmSync, statSync } from 'node:fs';
import { hostname, tmpdir } from 'node:os';
import { join } from 'node:path';
import { Effect } from 'effect';
import { afterEach, describe, expect, it } from 'vitest';
import { claim, forget, found } from '../connection.js';
import { openStore } from '../store/index.js';

const folders: Array<string> = [];
afterEach(() => {
  for (const made of folders.splice(0)) rmSync(made, { recursive: true });
});
const dbIn = () => {
  const made = mkdtempSync(join(tmpdir(), 'connect-connection-'));
  folders.push(made);
  return join(made, 'ke-connect.db');
};

/** `run` on ke-connect.db at `db`, opened for it alone. */
const at = <A, E>(
  db: string,
  run: (
    store: Effect.Success<ReturnType<typeof openStore>>,
  ) => Effect.Effect<A, E>,
) => Effect.runPromise(Effect.scoped(Effect.flatMap(openStore(db), run)));

const ada = { id: 'u-ada', email: 'ada@example.com' };
const bob = { id: 'u-bob', email: 'bob@example.com' };
const cloud = 'https://connect.example';
const on = { cloud, startedAt: 1 };

describe('ke-connect.db keeps one Connection of one User', () => {
  it('makes the Connection once, in a 0600 file, then finds the same one', async () => {
    const db = dbIn();
    const first = await at(db, (store) => claim(store, { ...on, owner: ada }));
    expect(first.name).toBe(hostname().split('.')[0]);
    expect(statSync(db).mode & 0o777).toBe(0o600);
    expect(
      await at(db, (store) => claim(store, { ...on, owner: ada })),
    ).toEqual(first);
  });

  it('names a new Connection `firstName`, cut to 64 characters', async () => {
    const made = await at(dbIn(), (store) =>
      claim(store, {
        ...on,
        owner: ada,
        firstName: `${'h'.repeat(60)} (main)`,
      }),
    );
    expect(made.name).toBe(`${'h'.repeat(60)} (ma`);
  });

  it('keeps its name and id, and when it last started', async () => {
    const db = dbIn();
    const first = await at(db, (store) => claim(store, { ...on, owner: ada }));
    const again = await at(db, (store) =>
      claim(store, { ...on, startedAt: 2, owner: ada, firstName: 'studio' }),
    );
    expect(again).toEqual(first);
    expect((await at(db, found))?.startedAt).toBe(2);
  });

  it('refuses another Connect Cloud', async () => {
    const db = dbIn();
    await at(db, (store) => claim(store, { ...on, owner: ada }));
    const refused = await at(db, (store) =>
      Effect.flip(
        claim(store, { ...on, cloud: 'https://other.example', owner: ada }),
      ),
    );
    expect(refused._tag).toBe('ConnectionOfAnotherCloud');
    expect(refused.message).toContain(`--cloud ${cloud}`);
  });

  it('shortens a kept name that has the whole of the host name', async () => {
    const db = dbIn();
    const first = await at(db, (store) =>
      claim(store, { ...on, owner: ada, firstName: `${hostname()} (main)` }),
    );
    const again = await at(db, (store) => claim(store, { ...on, owner: ada }));
    expect(again).toEqual({
      ...first,
      name: `${hostname().split('.')[0]} (main)`,
    });
  });

  it('refuses another User on a Connection owned by one', async () => {
    const db = dbIn();
    await at(db, (store) => claim(store, { ...on, owner: ada }));
    const refused = await at(db, (store) =>
      Effect.flip(claim(store, { ...on, owner: bob })),
    );
    expect(refused._tag).toBe('ConnectionOwnedByAnother');
    expect(refused.message).toContain('ada@example.com');
    expect(refused.message).toContain('ke-connect remove');
  });

  it('is a new Connection after it is forgotten, for anyone', async () => {
    const db = dbIn();
    const first = await at(db, (store) => claim(store, { ...on, owner: ada }));
    await at(db, forget);
    expect(await at(db, found)).toBeNull();
    const next = await at(db, (store) => claim(store, { ...on, owner: bob }));
    expect(next.id).not.toBe(first.id);
  });
});
