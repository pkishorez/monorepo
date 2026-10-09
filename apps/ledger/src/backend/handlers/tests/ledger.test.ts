import { Effect, Exit, Fiber, Layer, Schema, Scope, Stream } from 'effect';
import { RpcTest } from 'effect/rpc';
import { Authz } from '@kstackz/auth-toolkit/guard';
import { authz } from '@kstackz/auth-toolkit/server';
import { defaultBroadcaster } from '@kstackz/std-toolkit/core';
import { Memory } from '@kstackz/std-toolkit/db/memory';
import { describe, expect, it } from 'vitest';
import { LedgerApi } from '../../../api/index.ts';
import { ledgerTable } from '../../services/table/index.ts';
import { LedgerHandlers } from '../index.ts';

// The handlers over a table in memory, called as `user`.
const as = (user: string) =>
  Layer.mergeAll(
    LedgerHandlers,
    authz.layer.pipe(
      Layer.provide(
        Layer.succeed(Authz.Resolver, {
          resolve: () =>
            Effect.succeed({
              current: {
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

// One Broadcaster both users' handlers write to, as one Durable Object's.
const oneBroadcaster = () =>
  Layer.succeedContext(
    Effect.runSync(
      Layer.buildWithScope(defaultBroadcaster, Scope.makeUnsafe()),
    ),
  );

// Runs `use` with a client for u1 and one for u2, over one table, and with
// `live`, one Broadcaster.
const run = <A, E>(
  use: (mine: Client, theirs: Client) => Effect.Effect<A, E>,
  options: { readonly live?: boolean } = {},
) => {
  const table = options.live
    ? Layer.merge(Memory.make(ledgerTable).layer, oneBroadcaster())
    : Memory.make(ledgerTable).layer;
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
      ['PreferencesPut', { userId: 'u1', currency: 'INR' }],
      [
        'AccountPut',
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
        yield* rpc.LedgerSample({ entries: true });
        yield* rpc.LedgerSample({ entries: true });
        const accounts = yield* rpc.AccountChanges({ after: null });
        expect(accounts).toHaveLength(4);
        const first = yield* rpc.EntryChanges({ after: null });
        expect(first.length).toBeGreaterThan(60);
        const last = first.at(-1)!;
        expect(yield* rpc.EntryChanges({ after: last.meta._u })).toHaveLength(
          0,
        );
      }),
    );
  });

  it('keeps each user to their own money, whatever user a value names', async () => {
    await run((mine, theirs) =>
      Effect.gen(function* () {
        const put = yield* mine.AccountPut({
          value: {
            id: 'a1',
            userId: 'u2',
            name: 'Cash',
            kind: 'cash',
            createdAt: '',
          },
        });
        expect(put.value.userId).toBe('u1');
        expect(yield* theirs.AccountChanges({ after: null })).toHaveLength(0);
        expect(yield* mine.AccountChanges({ after: null })).toHaveLength(1);
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
        const written = yield* rpc.EntryPut({ value });
        const deleted = yield* rpc.EntryDelete({ id: 'e1' });
        expect(deleted.meta._d).toBe(true);
        const changes = yield* rpc.EntryChanges({
          after: written.meta._u,
        });
        expect(changes.map((each) => each.meta._d)).toEqual([true]);
        const back = yield* rpc.EntryPut({
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
        yield* rpc.LedgerSample({ entries: false });
        yield* rpc.LedgerClear({});
        const accounts = yield* rpc.AccountChanges({ after: null });
        expect(accounts.every((each) => each.meta._d)).toBe(true);
      }),
    );
  });

  const entry = (id: string, memo: string) => ({
    id,
    userId: 'u1',
    accountId: 'a',
    categoryId: 'c',
    cents: 450,
    way: 'out' as const,
    memo,
    day: '2026-10-05',
    createdAt: '2026-10-05T08:00:00.000Z',
  });

  it('pages older changes newest first', async () => {
    await run((rpc) =>
      Effect.gen(function* () {
        yield* rpc.EntryPut({ value: entry('e1', 'one') });
        yield* rpc.EntryPut({ value: entry('e2', 'two') });
        const newest = yield* rpc.EntryOlder({ before: null });
        expect(newest.map((each) => each.value.id)).toEqual(['e2', 'e1']);
        const below = yield* rpc.EntryOlder({ before: newest[0]!.meta._u });
        expect(below.map((each) => each.value.id)).toEqual(['e1']);
      }),
    );
  });

  it('watches: every change after the cursor, then each as it is made, only the user’s own', async () => {
    await run(
      (mine, theirs) =>
        Effect.scoped(
          Effect.gen(function* () {
            yield* mine.EntryPut({ value: entry('e1', 'before') });
            const heard = yield* mine.EntryWatch({ after: null }).pipe(
              Stream.flattenIterable,
              Stream.map((each) => each.value.id),
              Stream.takeUntil((id) => id === 'e2'),
              Stream.runCollect,
              Effect.forkScoped,
            );
            yield* Effect.sleep('10 millis');
            yield* theirs.EntryPut({
              value: { ...entry('x1', 'theirs'), userId: 'u2' },
            });
            yield* mine.EntryPut({ value: entry('e2', 'after') });
            const ids = yield* Fiber.join(heard);
            expect(ids).toContain('e1');
            expect(ids).not.toContain('x1');
            expect(ids.at(-1)).toBe('e2');
          }),
        ),
      { live: true },
    );
  });

  it('refuses to watch where no Broadcaster hears changes, as on D1', async () => {
    const exit = await run((rpc) =>
      rpc.EntryWatch({ after: null }).pipe(Stream.runCollect, Effect.exit),
    );
    expect(Exit.isFailure(exit)).toBe(true);
  });
});
