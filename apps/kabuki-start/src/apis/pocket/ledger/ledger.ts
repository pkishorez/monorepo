import { Effect } from 'effect';
import type { Entity } from '@kestack/std-toolkit/core';
import { type DatabaseError } from '@kestack/std-toolkit/db';
import { Invalid, NotFound, Overdraft, PAGE } from '../contract/index.ts';
import { Entry, transferEntryIds, Wallet } from '../domain/index.ts';
import { entries, pocketTable, wallets } from '../storage/index.ts';

/*
 * Pocket's rules, for one User's records. A Wallet's balance is the sum of
 * its live Entries and never goes below zero: a post, a transfer or a
 * deletion that would take it there is refused Overdraft, and nothing is
 * written. Each write is checked against what is stored, then applied in
 * one transaction whose balance changes are checked again as they commit;
 * if another write got in between, it is checked and applied afresh.
 *
 * A write whose ids are already taken did its work before: it answers what
 * is stored instead of doing it again.
 */

type Changes = {
  readonly wallets: ReadonlyArray<Entity<Wallet>>;
  readonly entries: ReadonlyArray<Entity<Entry>>;
};

/** Every record a write stored, sorted by kind. */
const changes = (stored: ReadonlyArray<object | null>): Changes => {
  const records = stored.filter(
    (record): record is Entity<Wallet | Entry> => record !== null,
  );
  return {
    wallets: records.filter(
      (record) => record.meta._e === Wallet.name,
    ) as never,
    entries: records.filter((record) => record.meta._e === Entry.name) as never,
  };
};

/** Up to a page of records changed after `after`, oldest change first. */
const page = <T>(after: Entity<T> | null) => ({
  limit: PAGE,
  ...(after === null ? {} : { after }),
});

/** The caller's live Wallet `id`, or NotFound. */
const walletOf = (userId: string, id: string) =>
  Effect.flatMap(
    wallets.get({ userId, id }, { excludeDeleted: true }),
    (wallet) =>
      wallet === null
        ? Effect.fail(new NotFound({ kind: 'wallet', id }))
        : Effect.succeed(wallet),
  );

/** Refuses taking `amount` off `wallet` below zero. */
const covers = (wallet: Entity<Wallet>, amount: number) =>
  wallet.value.balance + amount < 0
    ? Effect.fail(
        new Overdraft({
          walletId: wallet.value.id,
          balance: wallet.value.balance,
          amount,
        }),
      )
    : Effect.void;

/** Moves Wallet `id`'s balance by `amount` as the transaction commits, refusing it below zero. */
const move = (userId: string, id: string, amount: number) =>
  wallets.getAndUpdateOp(
    { userId, id },
    (current) => ({ balance: current.balance + amount }),
    { check: (current) => current.balance + amount >= 0 },
  );

/**
 * Runs `write` until it commits: a transaction another write raced is
 * checked and applied again. Storage failing otherwise is a defect.
 */
const isDatabaseError = (error: unknown): error is DatabaseError =>
  (error as { _tag?: unknown })._tag === 'DatabaseError';

const settle = <A, E, R>(
  write: Effect.Effect<A, E, R>,
): Effect.Effect<A, Exclude<E, DatabaseError>, R> =>
  write.pipe(
    Effect.retry({
      times: 3,
      while: (error) =>
        isDatabaseError(error) && error.reason._tag === 'TransactFailed',
    }),
    Effect.catch((error) =>
      isDatabaseError(error)
        ? Effect.die(error)
        : Effect.fail(error as Exclude<E, DatabaseError>),
    ),
  );

const createWallet = (userId: string, input: { id: string; name: string }) =>
  settle(
    Effect.gen(function* () {
      const existing = yield* wallets.get({ userId, id: input.id });
      if (existing !== null) return changes([existing]);
      return changes([yield* wallets.insert({ ...input, userId, balance: 0 })]);
    }),
  );

const renameWallet = (userId: string, input: { id: string; name: string }) =>
  settle(
    Effect.gen(function* () {
      yield* walletOf(userId, input.id);
      return changes([
        yield* wallets.getAndUpdate(
          { userId, id: input.id },
          { name: input.name },
        ),
      ]);
    }),
  );

const post = (
  userId: string,
  input: { id: string; walletId: string; amount: number; note: string },
) =>
  settle(
    Effect.gen(function* () {
      const done = yield* entries.get({ userId, id: input.id });
      if (done !== null) {
        const wallet = yield* wallets.get({ userId, id: done.value.walletId });
        return changes([wallet, done]);
      }
      if (input.amount === 0) {
        return yield* new Invalid({ reason: 'An entry moves some money' });
      }
      const wallet = yield* walletOf(userId, input.walletId);
      yield* covers(wallet, input.amount);
      return changes(
        yield* pocketTable.transact([
          yield* entries.insertOp({
            ...input,
            userId,
            kind: input.amount < 0 ? 'withdrawal' : 'deposit',
            transferId: null,
          }),
          yield* move(userId, input.walletId, input.amount),
        ]),
      );
    }),
  );

const transfer = (
  userId: string,
  input: { id: string; from: string; to: string; amount: number; note: string },
) =>
  settle(
    Effect.gen(function* () {
      const ids = transferEntryIds(input.id);
      const done = yield* entries.get({ userId, id: ids.from });
      if (done !== null) {
        return changes([
          yield* wallets.get({ userId, id: input.from }),
          yield* wallets.get({ userId, id: input.to }),
          done,
          yield* entries.get({ userId, id: ids.to }),
        ]);
      }
      if (input.from === input.to) {
        return yield* new Invalid({ reason: 'A transfer needs two wallets' });
      }
      if (input.amount <= 0) {
        return yield* new Invalid({ reason: 'A transfer moves some money' });
      }
      const from = yield* walletOf(userId, input.from);
      yield* walletOf(userId, input.to);
      yield* covers(from, -input.amount);
      const side = (id: string, walletId: string, amount: number) =>
        entries.insertOp({
          id,
          userId,
          walletId,
          amount,
          note: input.note,
          kind: 'transfer',
          transferId: input.id,
        });
      return changes(
        yield* pocketTable.transact([
          yield* side(ids.from, input.from, -input.amount),
          yield* side(ids.to, input.to, input.amount),
          yield* move(userId, input.from, -input.amount),
          yield* move(userId, input.to, input.amount),
        ]),
      );
    }),
  );

const deleteEntry = (userId: string, input: { id: string }) =>
  settle(
    Effect.gen(function* () {
      const entry = yield* entries.get({ userId, id: input.id });
      if (entry === null) {
        return yield* new NotFound({ kind: 'entry', id: input.id });
      }
      // A transfer is deleted whole: both of its sides.
      const { transferId } = entry.value;
      const sides =
        transferId === null
          ? [entry]
          : (yield* Effect.forEach(
              Object.values(transferEntryIds(transferId)),
              (id) => entries.get({ userId, id }),
            )).filter((side) => side !== null);
      const live = sides.filter((side) => !side.meta._d);
      if (live.length === 0) {
        const touched = yield* Effect.forEach(sides, (side) =>
          wallets.get({ userId, id: side.value.walletId }),
        );
        return changes([...touched, ...sides]);
      }
      for (const side of live) {
        yield* covers(
          yield* walletOf(userId, side.value.walletId),
          -side.value.amount,
        );
      }
      const ops = yield* Effect.forEach(live, (side) =>
        Effect.all([
          entries.deleteOp({ userId, id: side.value.id }),
          move(userId, side.value.walletId, -side.value.amount),
        ]),
      );
      return changes(yield* pocketTable.transact(ops.flat()));
    }),
  );

/** What a read or a write does, for the User `userId`, over storage. */
export const Ledger = {
  wallets: (userId: string, after: Entity<Wallet> | null) =>
    wallets.query('byUpdate', { pk: { userId }, '>=': null }, page(after)).pipe(
      Effect.map(({ items }) => items),
      Effect.orDie,
    ),
  entries: (userId: string, after: Entity<Entry> | null) =>
    entries.query('byUpdate', { pk: { userId }, '>=': null }, page(after)).pipe(
      Effect.map(({ items }) => items),
      Effect.orDie,
    ),
  createWallet,
  renameWallet,
  post,
  transfer,
  deleteEntry,
};
