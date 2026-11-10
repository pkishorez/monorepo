import { Effect } from 'effect';
import { FetchHttpClient } from 'effect/http';
import { beforeAll, describe, expect, it } from 'vitest';
import { fakeGuard } from '@kestack/auth-toolkit/fake';
import { SQLite } from '@kestack/std-toolkit/db/sqlite';
import { makeNodeSQLite } from '@kestack/std-toolkit/db/sqlite/node';
import {
  connectionsTable,
  serveOver,
} from '../../../../../../cloud/worker/index.js';
import { VERSION_HEADER } from '../../../../../../heartbeat/index.js';
import { HeartbeatClient, Outdated } from '../client.js';

/*
 * Connect Cloud's client as `ke-connect` builds it, against Connect Cloud
 * faked at `fetch`, with a Minimum Connect of 0.0.5 and no one signed in: a
 * call it lets through is refused Unauthenticated.
 */

const CLOUD = 'https://cloud.test';

const driver = makeNodeSQLite({ path: ':memory:' });

beforeAll(() =>
  Effect.runPromise(
    SQLite.setup(connectionsTable, { database: driver, mode: 'persistent' }),
  ),
);

/** Forget, called as `ke-connect` at `version`: how it failed, and the version header each request carried. */
const forgetAs = async (
  version: string,
  answer: (request: Request) => Promise<Response> = serveOver({
    guard: fakeGuard.rpc({ as: null }),
    authInfo: { url: 'https://auth.test' },
    origins: [],
    driver,
    minConnect: '0.0.5',
  }),
) => {
  const headers: Array<string | null> = [];
  const fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = new Request(input, init);
    headers.push(request.headers.get(VERSION_HEADER));
    return answer(request);
  }) as typeof globalThis.fetch;
  const failed = await Effect.runPromise(
    Effect.flip(
      Effect.flatMap(HeartbeatClient, (client) => client.Forget({ id: 'c1' })),
    ).pipe(
      Effect.provide(HeartbeatClient.layer(CLOUD, version)),
      Effect.provideService(FetchHttpClient.Fetch, fetch),
    ),
  );
  return { failed, headers };
};

describe("Connect Cloud's client", () => {
  it('sends its version on every call', async () => {
    const { headers } = await forgetAs('0.0.5');
    expect(headers).toEqual(['0.0.5']);
  });

  it('fails Outdated, with the line Connect Cloud sent, when refused 426', async () => {
    const { failed } = await forgetAs('0.0.4');
    expect(failed).toBeInstanceOf(Outdated);
    expect(failed).toMatchObject({
      _tag: 'Outdated',
      line: 'ke-connect 0.0.4 is older than Connect Cloud accepts (0.0.5): run `npm i -g @kestack/connect@latest`, then start it again.',
    });
  });

  it('reads 426 off the response alone, whatever its body', async () => {
    const { failed } = await forgetAs('0.0.4', async () =>
      Promise.resolve(new Response('Too old.\n', { status: 426 })),
    );
    expect(failed).toMatchObject({ _tag: 'Outdated', line: 'Too old.' });
  });

  it('is let through at the Minimum Connect or above', async () => {
    for (const version of ['0.0.5', '0.1.0'])
      expect((await forgetAs(version)).failed).toMatchObject({
        _tag: 'Unauthenticated',
      });
  });
});
