import { existsSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Effect } from 'effect';
import { FetchHttpClient } from 'effect/http';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fakeGuard } from '@kestack/auth-toolkit/fake';
import { SQLite } from '@kestack/std-toolkit/db/sqlite';
import { makeNodeSQLite } from '@kestack/std-toolkit/db/sqlite/node';
import {
  connectionsTable,
  serveOver,
} from '../../../../../cloud/worker/index.js';
import { forget, identify } from '../identity.js';

/*
 * Forgetting a Connection, as `ke-connect remove` does, against a Connect
 * Cloud that refuses this `ke-connect` as Outdated and an Auth Worker faked
 * at `fetch` that approves Ada at once.
 */

const CLOUD = 'https://cloud.test';
const AUTH = 'https://auth.test';
const ada = { id: 'ada', email: 'ada@example.com', name: 'Ada' };

/** Connect Cloud refusing any `ke-connect` below 99.0.0, and the Auth Worker it names. */
const fakes = async () => {
  const driver = makeNodeSQLite({ path: ':memory:' });
  await Effect.runPromise(
    SQLite.setup(connectionsTable, { database: driver, mode: 'persistent' }),
  );
  const cloud = serveOver({
    guard: fakeGuard.rpc({ as: null }),
    authInfo: { url: AUTH },
    origins: [],
    driver,
    minConnect: '99.0.0',
  });
  const calls: Array<string> = [];
  const json = (body: unknown) => Response.json(body);
  return {
    calls,
    fetch: (async (input: RequestInfo | URL, init?: RequestInit) => {
      const request = new Request(input, init);
      const url = new URL(request.url);
      if (url.origin === CLOUD) return cloud(request);
      const path = url.pathname.replace('/api/auth', '');
      calls.push(path);
      switch (path) {
        case '/device/code':
          return json({
            device_code: 'dc',
            user_code: 'ABCD-EFGH',
            verification_uri: `${AUTH}/device`,
            verification_uri_complete: `${AUTH}/device?user_code=ABCD-EFGH`,
            interval: 0,
          });
        case '/device/token':
          return json({ access_token: 'token', token_type: 'Bearer' });
        case '/get-session':
          return json({ user: ada, session: { token: 'token' } });
        default:
          return json({ success: true });
      }
    }) as typeof globalThis.fetch,
  };
};

afterEach(() => vi.restoreAllMocks());

describe('forgetting a Connection Connect Cloud refuses as Outdated', () => {
  it('says Connect Cloud still lists it, with its line, and still signs out and forgets it here', async () => {
    const fake = await fakes();
    vi.stubGlobal('fetch', fake.fetch);
    vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const said = vi.spyOn(console, 'error').mockImplementation(() => {});
    const folder = mkdtempSync(join(tmpdir(), 'connect-forget-'));
    const where = {
      cloud: CLOUD,
      db: join(folder, 'connect.db'),
      connectionFile: join(folder, 'connection.json'),
      version: '0.0.6',
    };
    try {
      await Effect.runPromise(
        Effect.scoped(
          identify({ ...where, firstName: 'laptop', startedAt: 1 }),
        ).pipe(Effect.provideService(FetchHttpClient.Fetch, fake.fetch)),
      );
      expect(existsSync(where.connectionFile)).toBe(true);

      await Effect.runPromise(
        forget(where).pipe(
          Effect.provideService(FetchHttpClient.Fetch, fake.fetch),
        ),
      );
      expect(said.mock.calls.map((args) => args.join(' '))).toEqual([
        'ke-connect 0.0.6 is older than Connect Cloud accepts (99.0.0): run `npm i -g @kestack/connect@latest`, then start it again.\nConnect Cloud still lists laptop, as this ke-connect is too old to have it forgotten: forget it from the app.',
      ]);
      expect(fake.calls).toContain('/sign-out');
      expect(existsSync(where.connectionFile)).toBe(false);
    } finally {
      vi.unstubAllGlobals();
    }
  }, 30_000);
});
