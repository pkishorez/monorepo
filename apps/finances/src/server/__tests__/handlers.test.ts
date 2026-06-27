import { Effect, Stream } from 'effect';
import { describe, expect, it } from 'vitest';
import {
  OverrideHandlersLive,
  SettingsHandlersLive,
  TransactionHandlersLive,
} from '../handlers.js';
import { makeDbLayer } from '../../services/index.js';
import { Db } from '../../services/db.js';
import type { SqliteDB } from 'std-toolkit/sqlite';
import type {
  OverrideSchema,
  ProjectionOutputSchema,
  TransactionSchema,
} from '../../domain/index.js';

const itEffect = <A, E>(name: string, fn: () => Effect.Effect<A, E, never>) =>
  it(name, () => Effect.runPromise(fn()));

type ProjectionOutput = typeof ProjectionOutputSchema.Type;
type Transaction = typeof TransactionSchema.Type;
type Override = typeof OverrideSchema.Type;

const runWithDb = <A, E>(effect: Effect.Effect<A, E, Db | SqliteDB>) =>
  effect.pipe(
    Effect.provide(makeDbLayer(':memory:')),
    Effect.scoped,
  ) as Effect.Effect<A, E, never>;

const makeTransaction = (
  id: string,
  overrides: Partial<Transaction> = {},
): Transaction => ({
  id,
  date: '2026-01-01',
  owner: 'kishore',
  bank: 'bank',
  description: `transaction ${id}`,
  amount: -100,
  type: 'debit',
  category: 'misc',
  subcategory: 'other',
  is_transfer: false,
  ...overrides,
});

const makeProjection = (transactions: Transaction[]): ProjectionOutput => ({
  generated_at: '2026-01-01T00:00:00.000Z',
  accounts: ['bank'],
  total_transactions: transactions.length,
  transactions,
});

const makeOverride = (
  transactionId: string,
  overrides: Partial<Override> = {},
): Override => ({
  transactionId,
  category: 'food',
  subcategory: 'restaurant',
  verified: true,
  ignore: false,
  cancelled_by: null,
  ...overrides,
});

const takeEvents = <A, E, R>(stream: Stream.Stream<A, E, R>, count: number) =>
  stream.pipe(Stream.take(count), Stream.runCollect);

describe('transaction replacement', () => {
  itEffect('deletes old transactions and inserts uploaded transactions', () =>
    runWithDb(
      Effect.gen(function* () {
        const handlers = yield* TransactionHandlersLive;

        yield* handlers.replaceTransactions(
          makeProjection([makeTransaction('old-1'), makeTransaction('old-2')]),
        );
        yield* handlers.replaceTransactions(
          makeProjection([makeTransaction('new-1')]),
        );

        const events = yield* takeEvents(
          handlers.subscribeTransactions({ cursor: null, limit: 10 }),
          2,
        );

        expect(events[0]).toMatchObject({ _tag: 'batch' });
        if (events[0]?._tag !== 'batch') throw new Error('missing batch');
        expect(events[0].items.map((item) => item.value.id)).toEqual(['new-1']);
        expect(events[1]).toEqual({ _tag: 'initial-sync-done' });
      }),
    ),
  );

  itEffect('keeps overrides and singleton settings during replacement', () =>
    runWithDb(
      Effect.gen(function* () {
        const transactions = yield* TransactionHandlersLive;
        const overrides = yield* OverrideHandlersLive;
        const settings = yield* SettingsHandlersLive;

        yield* overrides.saveOverride(makeOverride('tx-1'));
        yield* settings.putSettings({
          categoryTypes: { food: 'spend' },
        });
        yield* transactions.replaceTransactions(
          makeProjection([makeTransaction('tx-2')]),
        );

        const overrideEvents = yield* takeEvents(
          overrides.subscribeOverrides({ cursor: null, limit: 10 }),
          2,
        );
        const settingsResult = yield* settings.getSettings();

        expect(overrideEvents[0]).toMatchObject({ _tag: 'batch' });
        if (overrideEvents[0]?._tag !== 'batch') {
          throw new Error('missing override batch');
        }
        expect(overrideEvents[0].items.map((item) => item.value)).toEqual([
          makeOverride('tx-1'),
        ]);
        expect(settingsResult.value.categoryTypes).toEqual({ food: 'spend' });
      }),
    ),
  );

  itEffect('empty uploads clear only transactions', () =>
    runWithDb(
      Effect.gen(function* () {
        const transactions = yield* TransactionHandlersLive;
        const overrides = yield* OverrideHandlersLive;
        const settings = yield* SettingsHandlersLive;

        yield* transactions.replaceTransactions(
          makeProjection([makeTransaction('tx-1')]),
        );
        yield* overrides.saveOverride(makeOverride('tx-1'));
        yield* settings.putSettings({
          categoryTypes: { misc: 'ignore' },
        });

        yield* transactions.replaceTransactions(makeProjection([]));

        const transactionEvents = yield* takeEvents(
          transactions.subscribeTransactions({ cursor: null, limit: 10 }),
          1,
        );
        const overrideEvents = yield* takeEvents(
          overrides.subscribeOverrides({ cursor: null, limit: 10 }),
          2,
        );
        const settingsResult = yield* settings.getSettings();

        expect(transactionEvents).toEqual([{ _tag: 'initial-sync-done' }]);
        expect(overrideEvents[0]).toMatchObject({ _tag: 'batch' });
        expect(settingsResult.value.categoryTypes).toEqual({ misc: 'ignore' });
      }),
    ),
  );
});

describe('settings handlers', () => {
  itEffect('round-trip category assignments through singleton settings', () =>
    runWithDb(
      Effect.gen(function* () {
        const settings = yield* SettingsHandlersLive;

        const defaultSettings = yield* settings.getSettings();
        const saved = yield* settings.putSettings({
          categoryTypes: { salary: 'income', rent: 'spend' },
        });
        const fetched = yield* settings.getSettings();

        expect(defaultSettings.value.categoryTypes).toEqual({});
        expect(saved.value.categoryTypes).toEqual({
          salary: 'income',
          rent: 'spend',
        });
        expect(fetched.value.categoryTypes).toEqual(saved.value.categoryTypes);
      }),
    ),
  );
});

describe('sync streams', () => {
  itEffect('emits transaction batches after the _u cursor', () =>
    runWithDb(
      Effect.gen(function* () {
        const db = yield* Db;
        const handlers = yield* TransactionHandlersLive;

        const first = yield* db.transaction.insert(makeTransaction('tx-1'));
        yield* Effect.sleep('2 millis');
        yield* db.transaction.insert(makeTransaction('tx-2'));

        const events = yield* takeEvents(
          handlers.subscribeTransactions({
            cursor: first.meta._u,
            limit: 10,
          }),
          2,
        );

        expect(events[0]).toMatchObject({ _tag: 'batch' });
        if (events[0]?._tag !== 'batch') throw new Error('missing batch');
        expect(events[0].items.map((item) => item.value.id)).toEqual(['tx-2']);
        expect(events[1]).toEqual({ _tag: 'initial-sync-done' });
      }),
    ),
  );

  itEffect('emits override batches after the _u cursor', () =>
    runWithDb(
      Effect.gen(function* () {
        const db = yield* Db;
        const handlers = yield* OverrideHandlersLive;

        const first = yield* db.override.insert(makeOverride('tx-1'));
        yield* Effect.sleep('2 millis');
        yield* db.override.insert(makeOverride('tx-2'));

        const events = yield* takeEvents(
          handlers.subscribeOverrides({
            cursor: first.meta._u,
            limit: 10,
          }),
          2,
        );

        expect(events[0]).toMatchObject({ _tag: 'batch' });
        if (events[0]?._tag !== 'batch') throw new Error('missing batch');
        expect(events[0].items.map((item) => item.value.transactionId)).toEqual(
          ['tx-2'],
        );
        expect(events[1]).toEqual({ _tag: 'initial-sync-done' });
      }),
    ),
  );
});
