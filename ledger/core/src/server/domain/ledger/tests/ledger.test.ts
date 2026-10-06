import { Effect, Layer, Schema } from 'effect';
import { RpcTest } from 'effect/rpc';
import { Authz } from '@kstackz/auth-toolkit/rpc';
import { authzLayer } from '@kstackz/auth-toolkit/server/rpc';
import { Memory } from '@kstackz/std-toolkit/db/memory';
import { describe, expect, it } from 'vitest';
import { LedgerApi } from '../../../../shared/ledger-api/index.ts';
import { ledgerTable } from '../../storage/index.ts';
import { LedgerHandlers } from '../index.ts';

// The handlers over a table in memory, called as `user`.
const as = (user: string) =>
  Layer.mergeAll(
    LedgerHandlers,
    authzLayer.pipe(
      Layer.provide(
        Layer.succeed(Authz.Resolver, {
          resolve: () =>
            Effect.succeed({
              currentAuth: {
                kind: 'session',
                user: { id: user, email: `${user}@x`, name: user },
                session: { id: user },
              } as never,
              refreshedCookies: [],
            }),
        }),
      ),
    ),
  );

const makeClient = () => RpcTest.makeClient(LedgerApi);
type Client = Effect.Success<ReturnType<typeof makeClient>>;

// Runs `use` with a client for u1 and one for u2, over one table.
const run = <A, E>(
  use: (mine: Client, theirs: Client) => Effect.Effect<A, E>,
) => {
  const table = Memory.make(ledgerTable).layer;
  const clientOf = (user: string) =>
    makeClient().pipe(Effect.provide(as(user).pipe(Layer.provideMerge(table))));
  return Effect.runPromise(
    Effect.gen(function* () {
      return yield* use(yield* clientOf('u1'), yield* clientOf('u2'));
    }).pipe(Effect.scoped, Effect.provide(table)),
  );
};

describe('the Ledger API', () => {
  // RpcTest skips serialization; the browser sends JSON.
  it('reads every write as JSON carries it', () => {
    for (const [tag, value] of [
      ['Preferences.Put', { userId: 'u1', currency: 'INR' }],
      [
        'Accounts.Put',
        { id: 'a1', userId: 'u1', name: 'Cash', kind: 'cash', createdAt: '' },
      ],
    ] as const) {
      const json = Schema.toCodecJson(
        LedgerApi.requests.get(tag)!.payloadSchema,
      ) as unknown as Schema.Codec<unknown, unknown>;
      const wire = JSON.parse(
        JSON.stringify(Schema.encodeUnknownSync(json)({ value })),
      );
      expect(Schema.decodeUnknownSync(json)(wire)).toEqual({ value });
    }
  });

  it('writes the sample once, and sends every change after a cursor', async () => {
    await run((rpc) =>
      Effect.gen(function* () {
        yield* rpc['Ledger.Sample']({ entries: true });
        yield* rpc['Ledger.Sample']({ entries: true });
        const accounts = yield* rpc['Accounts.Changes']({ after: null });
        expect(accounts).toHaveLength(4);
        const first = yield* rpc['Entries.Changes']({ after: null });
        expect(first.length).toBeGreaterThan(60);
        const last = first.at(-1)!;
        expect(
          yield* rpc['Entries.Changes']({ after: last.meta._u }),
        ).toHaveLength(0);
      }),
    );
  });

  it('keeps each user to their own money, whatever user a value names', async () => {
    await run((mine, theirs) =>
      Effect.gen(function* () {
        const put = yield* mine['Accounts.Put']({
          value: {
            id: 'a1',
            userId: 'u2',
            name: 'Cash',
            kind: 'cash',
            createdAt: '',
          },
        });
        expect(put.value.userId).toBe('u1');
        expect(yield* theirs['Accounts.Changes']({ after: null })).toHaveLength(
          0,
        );
        expect(yield* mine['Accounts.Changes']({ after: null })).toHaveLength(
          1,
        );
      }),
    );
  });

  it('marks a deleted Entry as a change, and brings it back when written again', async () => {
    await run((rpc) =>
      Effect.gen(function* () {
        const value = {
          id: 'e1',
          userId: 'u1',
          accountId: 'a',
          categoryId: 'c',
          cents: 450,
          way: 'out' as const,
          memo: 'Coffee',
          day: '2026-10-05',
          createdAt: '2026-10-05T08:00:00.000Z',
        };
        const written = yield* rpc['Entries.Put']({ value });
        const deleted = yield* rpc['Entries.Delete']({ id: 'e1' });
        expect(deleted.meta._d).toBe(true);
        const changes = yield* rpc['Entries.Changes']({
          after: written.meta._u,
        });
        expect(changes.map((each) => each.meta._d)).toEqual([true]);
        const back = yield* rpc['Entries.Put']({
          value: { ...value, memo: 'Flat white' },
        });
        expect(back.meta._d).toBe(false);
        expect(back.value.memo).toBe('Flat white');
      }),
    );
  });

  it('clears everything of the user', async () => {
    await run((rpc) =>
      Effect.gen(function* () {
        yield* rpc['Ledger.Sample']({ entries: false });
        yield* rpc['Ledger.Clear']({});
        const accounts = yield* rpc['Accounts.Changes']({ after: null });
        expect(accounts.every((each) => each.meta._d)).toBe(true);
      }),
    );
  });
});
