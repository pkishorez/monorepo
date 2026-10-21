import { Effect, Schema } from 'effect';
import { Action } from '@kestack/std-toolkit/replica';
import type { Entity } from '@kestack/std-toolkit/core';
import {
  Entry,
  PocketRpc,
  transferEntryIds,
  Wallet,
} from '../../../apis/pocket/index.ts';
import { Pocket } from '../definition/index.ts';

/*
 * Pocket's writes, each an Action: the change shows at once in the
 * Account's Instance, then the Pocket Worker is asked, called for that
 * Account alone, and what it stored is Confirmed in place of the change.
 * If the Worker refuses, the change rolls back, and the Action ends with
 * one line saying why. Every Action's args name the Account it writes.
 */

const Account = { account: Schema.String };
const Cents = Schema.Int;

type Instance = Effect.Success<ReturnType<typeof Pocket.get>>;

const encodeWallet = Schema.encodeEffect(Wallet.entity);
const encodeEntry = Schema.encodeEffect(Entry.entity);

/** Confirms what one write changed, as the Worker answered it. */
const confirm = (
  pocket: Instance,
  changes: {
    readonly wallets: ReadonlyArray<Entity<Wallet>>;
    readonly entries: ReadonlyArray<Entity<Entry>>;
  },
) =>
  Effect.gen(function* () {
    const wallets = yield* Effect.forEach(changes.wallets, (wallet) =>
      encodeWallet(wallet),
    );
    const entries = yield* Effect.forEach(changes.entries, (entry) =>
      encodeEntry(entry),
    );
    yield* pocket.confirm([...wallets, ...entries] as Entity<unknown>[]);
  });

const money = (cents: number) => (cents / 100).toFixed(2);

/** A refusal as the one line the page shows. */
const explain = (error: { readonly _tag: string }) => {
  switch (error._tag) {
    case 'Overdraft': {
      const { balance } = error as unknown as { balance: number };
      return new Error(`Not enough money: ${money(balance)} left`);
    }
    case 'NotFound':
      return new Error('That is gone: it was deleted elsewhere');
    case 'Invalid':
      return new Error((error as unknown as { reason: string }).reason);
    case 'AccountChanged':
      return new Error('The account changed before this was saved');
    case 'Unauthenticated':
      return new Error('Signed out before this was saved');
    default:
      return new Error(`Not saved: ${error._tag}`);
  }
};

/** Asks the Worker for the Instance's write, then Confirms what it stored. */
const save = <E extends { readonly _tag: string }>(
  pocket: Instance,
  write: (rpc: PocketRpc['Service']) => Effect.Effect<
    {
      readonly wallets: ReadonlyArray<Entity<Wallet>>;
      readonly entries: ReadonlyArray<Entity<Entry>>;
    },
    E
  >,
) =>
  Effect.gen(function* () {
    const rpc = yield* PocketRpc;
    const changes = yield* write(rpc).pipe(Effect.mapError(explain));
    yield* confirm(pocket, changes);
  });

export const CreateWallet = Action.make('CreateWallet', {
  args: Schema.Struct({ ...Account, id: Schema.String, name: Schema.String }),
  run: ({ account, id, name }) =>
    Effect.gen(function* () {
      const pocket = yield* Pocket.get(account);
      yield* Action.optimistic(() =>
        pocket.wallets.insert({ id, userId: account, name, balance: 0 }),
      );
      yield* save(pocket, (rpc) => rpc.createWallet(account, { id, name }));
    }),
});

export const RenameWallet = Action.make('RenameWallet', {
  args: Schema.Struct({ ...Account, id: Schema.String, name: Schema.String }),
  run: ({ account, id, name }) =>
    Effect.gen(function* () {
      const pocket = yield* Pocket.get(account);
      yield* Action.optimistic(() =>
        pocket.wallets.update(id, (draft) => {
          draft.name = name;
        }),
      );
      yield* save(pocket, (rpc) => rpc.renameWallet(account, { id, name }));
    }),
});

/** A deposit (positive `amount`) or a withdrawal (negative). */
export const Post = Action.make('Post', {
  args: Schema.Struct({
    ...Account,
    id: Schema.String,
    walletId: Schema.String,
    amount: Cents,
    note: Schema.String,
  }),
  run: ({ account, ...input }) =>
    Effect.gen(function* () {
      const pocket = yield* Pocket.get(account);
      yield* Action.optimistic(() => {
        pocket.wallets.update(input.walletId, (draft) => {
          draft.balance += input.amount;
        });
        pocket.entries.insert({
          ...input,
          userId: account,
          kind: input.amount < 0 ? 'withdrawal' : 'deposit',
          transferId: null,
        });
      });
      yield* save(pocket, (rpc) => rpc.post(account, input));
    }),
});

export const Transfer = Action.make('Transfer', {
  args: Schema.Struct({
    ...Account,
    id: Schema.String,
    from: Schema.String,
    to: Schema.String,
    amount: Cents,
    note: Schema.String,
  }),
  run: ({ account, ...input }) =>
    Effect.gen(function* () {
      const pocket = yield* Pocket.get(account);
      const ids = transferEntryIds(input.id);
      const side = (id: string, walletId: string, amount: number) => ({
        id,
        userId: account,
        walletId,
        amount,
        note: input.note,
        kind: 'transfer' as const,
        transferId: input.id,
      });
      yield* Action.optimistic(() => {
        pocket.wallets.update(input.from, (draft) => {
          draft.balance -= input.amount;
        });
        pocket.wallets.update(input.to, (draft) => {
          draft.balance += input.amount;
        });
        pocket.entries.insert(side(ids.from, input.from, -input.amount));
        pocket.entries.insert(side(ids.to, input.to, input.amount));
      });
      yield* save(pocket, (rpc) => rpc.transfer(account, input));
    }),
});

/** Deletes an Entry; a transfer goes whole, both sides. */
export const DeleteEntry = Action.make('DeleteEntry', {
  args: Schema.Struct({ ...Account, id: Schema.String }),
  run: ({ account, id }) =>
    Effect.gen(function* () {
      const pocket = yield* Pocket.get(account);
      const entry = pocket.entries.get(id);
      const sides =
        entry?.transferId == null
          ? [entry]
          : Object.values(transferEntryIds(entry.transferId)).map((side) =>
              pocket.entries.get(side),
            );
      yield* Action.optimistic(() => {
        for (const side of sides) {
          if (side === undefined) continue;
          pocket.wallets.update(side.walletId, (draft) => {
            draft.balance -= side.amount;
          });
          pocket.entries.delete(side.id);
        }
      });
      yield* save(pocket, (rpc) => rpc.deleteEntry(account, { id }));
    }),
});
