import {
  existsSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  statSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Effect } from 'effect';
import { afterEach, describe, expect, it } from 'vitest';
import { Store } from '../contract/index.js';
import { backupName, layer, readConnection } from '../real/index.js';

const made: Array<string> = [];
afterEach(() => {
  for (const at of made.splice(0)) rmSync(at, { recursive: true, force: true });
});

const where = (version = '1.0.0') => {
  const root = mkdtempSync(join(tmpdir(), 'kc2-store-'));
  made.push(root);
  return {
    db: join(root, 'ke-connect.db'),
    backups: join(root, 'backups'),
    version,
    host: 'Ada-MacBook.local',
    shortHost: 'Ada-MacBook',
  };
};

const ADA = { id: 'ada', email: 'ada@kestack.test' };
const CLOUD = 'https://connect.test';

const withStore = <A, E>(
  options: ReturnType<typeof where>,
  use: (store: Store['Service']) => Effect.Effect<A, E>,
) =>
  Effect.runPromise(
    Effect.scoped(
      Effect.flatMap(Store, use).pipe(Effect.provide(layer(options))),
    ),
  );

describe('ke-connect.db', () => {
  it('is made readable by this user alone', async () => {
    const options = where();
    await withStore(options, () => Effect.void);
    expect(statSync(options.db).mode & 0o777).toBe(0o600);
  });

  it('claims a Connection once, and finds the same one on every start', async () => {
    const options = where();
    const first = await withStore(options, (store) =>
      store.claim({
        owner: ADA,
        cloud: CLOUD,
        name: 'Ada-MacBook',
        startedAt: 1,
      }),
    );
    const again = await withStore(options, (store) =>
      store.claim({ owner: ADA, cloud: CLOUD, name: 'Other', startedAt: 2 }),
    );
    expect(again).toEqual(first);
    expect(first.name).toBe('Ada-MacBook');
    expect(await Effect.runPromise(readConnection(options.db))).toMatchObject({
      id: first.id,
      startedAt: 2,
      owner: ADA,
      cloud: CLOUD,
    });
  });

  it('refuses another User, or another Connect Cloud', async () => {
    const options = where();
    await withStore(options, (store) =>
      store.claim({ owner: ADA, cloud: CLOUD, name: 'A', startedAt: 1 }),
    );
    const other = await withStore(options, (store) =>
      Effect.flip(
        store.claim({
          owner: { id: 'bob', email: 'bob@kestack.test' },
          cloud: CLOUD,
          name: 'A',
          startedAt: 2,
        }),
      ),
    );
    expect(other._tag).toBe('ConnectionOwnedByAnother');
    const cloud = await withStore(options, (store) =>
      Effect.flip(
        store.claim({
          owner: ADA,
          cloud: 'https://elsewhere.test',
          name: 'A',
          startedAt: 2,
        }),
      ),
    );
    expect(cloud._tag).toBe('ConnectionOfAnotherCloud');
  });

  it('forgets the Connection, so the next claim is a new one', async () => {
    const options = where();
    const first = await withStore(options, (store) =>
      store.claim({ owner: ADA, cloud: CLOUD, name: 'A', startedAt: 1 }),
    );
    await withStore(options, (store) => store.forget);
    const next = await withStore(options, (store) =>
      store.claim({ owner: ADA, cloud: CLOUD, name: 'A', startedAt: 2 }),
    );
    expect(next.id).not.toBe(first.id);
  });

  it('keeps the Auth Worker of each Connect Cloud apart', async () => {
    const options = where();
    await withStore(options, (store) =>
      store.keepAuthWorker({ cloud: CLOUD, url: 'https://auth.test' }),
    );
    expect(
      await withStore(options, (store) => store.authWorker(CLOUD)),
    ).toEqual({
      cloud: CLOUD,
      url: 'https://auth.test',
    });
    expect(
      await withStore(options, (store) =>
        store.authWorker('https://elsewhere.test'),
      ),
    ).toBeNull();
  });

  it('reads nothing and makes no file when there is none', async () => {
    const options = where();
    expect(await Effect.runPromise(readConnection(options.db))).toBeNull();
    expect(existsSync(options.db)).toBe(false);
  });
});

describe('backups', () => {
  it('copies the database once before each new version opens it, keeping the last three', async () => {
    const options = where();
    await withStore(options, (store) =>
      store.claim({ owner: ADA, cloud: CLOUD, name: 'A', startedAt: 1 }),
    );
    expect(existsSync(options.backups)).toBe(false);
    for (const version of ['1.0.1', '1.0.1', '1.0.2', '1.0.3', '1.0.4'])
      await withStore({ ...options, version }, () => Effect.void);
    const kept = readdirSync(options.backups).sort();
    expect(kept).toEqual([
      backupName('1.0.2'),
      backupName('1.0.3'),
      backupName('1.0.4'),
    ]);
    const restored = await Effect.runPromise(
      readConnection(join(options.backups, backupName('1.0.4'))),
    );
    expect(restored).toMatchObject({ owner: ADA, cloud: CLOUD });
  });
});
