import { Layer } from 'effect';
import { auth } from '@kestack/auth-toolkit/server';
import { server } from '@kestack/rpc-toolkit/rpc/http';
import { SQLite } from '@kestack/std-toolkit/db/sqlite';
import { makeD1SQLite } from '@kestack/std-toolkit/db/sqlite/d1';
import { asCaller, ownCursor } from './access/index.ts';
import { PocketRpcs } from './contract/index.ts';
import { Ledger } from './ledger/index.ts';
import { pocketTable } from './storage/index.ts';

/*
 * The Pocket Worker: each call is the Ledger's, for the User calling, over
 * the `pocket` table on the Worker's D1 database. The caller is read from
 * the session cookie the browser sends, checked with the Auth Worker; a
 * call with none is refused Unauthenticated, and one whose `expect-user`
 * is not the cookie's Active Account AccountChanged. The site is on another
 * origin of the same site, so its origin, and only its, may call with
 * credentials; a preflight is answered here, since the RPC server answers
 * POST alone.
 */

/** What this Worker is handed by Alchemy. */
interface Env {
  readonly AUTH_URL: string;
  readonly SITE_ORIGIN: string;
  readonly DB: D1Database;
  /** The physical name `D1.table` set the table up under. */
  readonly DB_TABLE: string;
}

const Handlers = PocketRpcs.toLayer({
  Wallets: ({ '>': after }) =>
    asCaller((userId) => Ledger.wallets(userId, ownCursor(after, userId))),
  Entries: ({ '>': after }) =>
    asCaller((userId) => Ledger.entries(userId, ownCursor(after, userId))),
  WalletEntries: ({ walletId, '>': after }) =>
    asCaller((userId) =>
      Ledger.walletEntries(userId, walletId, ownCursor(after, userId)),
    ),
  CreateWallet: (input) =>
    asCaller((userId) => Ledger.createWallet(userId, input)),
  RenameWallet: (input) =>
    asCaller((userId) => Ledger.renameWallet(userId, input)),
  Post: (input) => asCaller((userId) => Ledger.post(userId, input)),
  Transfer: (input) => asCaller((userId) => Ledger.transfer(userId, input)),
  DeleteEntry: (input) =>
    asCaller((userId) => Ledger.deleteEntry(userId, input)),
});

/** The CORS headers for `request`: its origin is echoed only when it is the site's. */
const corsFor = (request: Request, site: string): Record<string, string> =>
  request.headers.get('origin') === site
    ? {
        'access-control-allow-origin': site,
        'access-control-allow-credentials': 'true',
        'access-control-allow-methods': 'POST',
        'access-control-allow-headers':
          request.headers.get('access-control-request-headers') ?? '',
        'access-control-max-age': '600',
        vary: 'Origin',
      }
    : { vary: 'Origin' };

/**
 * Answers requests over the `pocket` table on `database`, with `guard`
 * telling who calls, letting `site` call with credentials: `auth.rpc({ url })`
 * in the Worker, `fakeGuard.rpc({ as })` in a test. `tableName` is the
 * physical name the table was set up under, its logical name by default.
 */
export const serve = (
  guard: ReturnType<typeof auth.rpc>,
  site: string,
  database: D1Database,
  tableName?: string,
) => {
  const table = SQLite.make(pocketTable, {
    database: makeD1SQLite({ database }),
    ...(tableName === undefined ? {} : { tableName }),
  });
  const answer = server(
    PocketRpcs,
    Layer.mergeAll(Handlers.pipe(Layer.provide(table.layer)), guard),
  );
  return async (request: Request): Promise<Response> => {
    const cors = corsFor(request, site);
    if (request.method === 'OPTIONS')
      return new Response(null, { status: 204, headers: cors });
    const response = await answer(request);
    const headers = new Headers(response.headers);
    for (const [name, value] of Object.entries(cors)) headers.set(name, value);
    return new Response(response.body, { status: response.status, headers });
  };
};

let served: ((request: Request) => Promise<Response>) | undefined;

export default {
  fetch: (request: Request, env: Env) =>
    (served ??= serve(
      auth.rpc({ url: env.AUTH_URL }),
      env.SITE_ORIGIN,
      env.DB,
      env.DB_TABLE,
    ))(request),
};
