import { readdir } from 'node:fs/promises';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { Effect, Exit } from 'effect';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { fakeCloudflare, SANDBOX } from './support/cloudflare.ts';
import { collect, startConsole } from './support/console.ts';

/*
 * Credentials through `/rpc`, in the Worker as it deploys: verified with the
 * provider, sealed before they are stored, live in every tab of their owner,
 * and nobody else's.
 */

const ada = { id: 'local_ada', email: 'ada@demo', name: 'Ada' };
const bob = { id: 'local_bob', email: 'bob@demo', name: 'Bob' };

let console_: Awaited<ReturnType<typeof startConsole>>;
beforeAll(async () => {
  console_ = await startConsole({
    invites: 'ada@demo, bob@demo',
    outbound: fakeCloudflare,
  });
});
afterAll(() => console_?.dispose());

const run = <A, E>(effect: Effect.Effect<A, E, import('effect').Scope.Scope>) =>
  Effect.runPromise(Effect.scoped(effect));

const sandbox = (name: string, apiToken = SANDBOX.apiToken) => ({
  provider: 'cloudflare' as const,
  name,
  secret: { accountId: SANDBOX.accountId, apiToken },
});

/** Every row of every table in every User Space's SQLite file, as text. */
const rawRows = async () => {
  const files: Array<string> = [];
  const walk = async (dir: string) => {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const at = path.join(dir, entry.name);
      if (entry.isDirectory()) await walk(at);
      else if (entry.name.endsWith('.sqlite')) files.push(at);
    }
  };
  await walk(console_.persist);
  return files.flatMap((file) => {
    const db = new DatabaseSync(file, { readOnly: true });
    try {
      const tables = db
        .prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
        .all() as Array<{ name: string }>;
      return tables.flatMap(({ name }) => {
        const select = db.prepare(
          `SELECT * FROM "${name.replaceAll('"', '""')}"`,
        );
        select.setReadBigInts(true);
        return select
          .all()
          .map((row) =>
            JSON.stringify(row, (_, value) =>
              typeof value === 'bigint' ? String(value) : value,
            ),
          );
      });
    } finally {
      db.close();
    }
  });
};

describe('Credentials', () => {
  it('shows a credential added in one tab in another, with the account Cloudflare confirmed', () =>
    run(
      Effect.gen(function* () {
        const watching = yield* console_.socket(ada);
        const list = yield* collect(watching['Credentials.list']());
        expect(yield* list.next).toEqual([]);

        const adding = yield* console_.socket(ada);
        const added = yield* adding['Credentials.add'](sandbox('Sandbox'));
        expect(added).toMatchObject({
          name: 'Sandbox',
          provider: 'cloudflare',
          accountId: SANDBOX.accountId,
          accountName: SANDBOX.accountName,
          region: null,
        });
        expect(JSON.stringify(added)).not.toContain(SANDBOX.apiToken);

        expect(yield* list.next).toEqual([added]);
      }),
    ));

  it('keeps no plaintext secret in the stored row', async () => {
    const rows = await rawRows();
    const stored = rows.filter((row) => row.includes('Sandbox Account'));
    expect(stored.length).toBeGreaterThan(0);
    expect(stored.some((row) => row.includes('v1.'))).toBe(true);
    for (const row of rows) expect(row).not.toContain(SANDBOX.apiToken);
  });

  it('draws Settings already listing the member’s credentials', async () => {
    const response = await console_.fetch('/settings', ada);
    const html = await response.text();
    expect(response.status).toBe(200);
    expect(html).toContain('<title>Settings · Alchemy Console</title>');
    expect(html).toContain('Sandbox Account');
    expect(html).not.toContain(SANDBOX.apiToken);
  });

  it('refuses a wrong token under its field, naming the failure', () =>
    run(
      Effect.gen(function* () {
        const tab = yield* console_.socket(ada);
        const exit = yield* Effect.exit(
          tab['Credentials.add'](sandbox('Wrong', 'not-the-token')),
        );
        expect(exit).toEqual(
          Exit.fail(
            expect.objectContaining({
              _tag: 'CredentialError',
              reason: 'rejected',
              field: 'apiToken',
              message: expect.stringContaining('Invalid API Token'),
            }),
          ),
        );
      }),
    ));

  it('refuses a second credential with the same name', () =>
    run(
      Effect.gen(function* () {
        const tab = yield* console_.socket(ada);
        const error = yield* Effect.flip(
          tab['Credentials.add'](sandbox('sandbox')),
        );
        expect(error).toMatchObject({ reason: 'invalid', field: 'name' });
      }),
    ));

  it('never shows one member’s credentials to another', () =>
    run(
      Effect.gen(function* () {
        const tab = yield* console_.socket(bob);
        const list = yield* collect(tab['Credentials.list']());
        expect(yield* list.next).toEqual([]);
      }),
    ));

  it('renames and removes live in every tab', () =>
    run(
      Effect.gen(function* () {
        const watching = yield* console_.socket(ada);
        const list = yield* collect(watching['Credentials.list']());
        const [sandboxCredential] = yield* list.next;
        const { credentialId } = sandboxCredential!;

        const acting = yield* console_.socket(ada);
        yield* acting['Credentials.rename']({
          credentialId,
          name: 'Sandbox account',
        });
        expect((yield* list.next).map(({ name }) => name)).toEqual([
          'Sandbox account',
        ]);

        yield* acting['Credentials.remove']({ credentialId });
        expect(yield* list.next).toEqual([]);

        const gone = yield* Effect.flip(
          acting['Credentials.remove']({ credentialId }),
        );
        expect(gone).toMatchObject({ reason: 'not-found' });
      }),
    ));
});
