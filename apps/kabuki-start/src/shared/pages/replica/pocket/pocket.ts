import { Effect, Schema } from 'effect';
import { Actor, Command } from '@kestack/kabuki';
import { Replicas } from '@kestack/std-toolkit/replica';
import { PocketRpc } from '../../../../apis/pocket/index.ts';
import {
  CreateWallet,
  DeleteEntry,
  Post,
  Transfer,
} from '../../../../replicas/pocket/index.ts';
import { Entries, Wallets } from './queries.ts';

/*
 * A Pocket: one Account's wallets and entries, and, while that Account is
 * the active one, the one-click writes. The Account comes as Props from
 * the page, so showing another moves the Queries to its Instance; every
 * write is an Action whose args name the Account it was asked for, so one
 * asked before a switch lands there, or fails.
 *
 * 1. Ask     a write runs at once, its Optimistic Changes showing before
 *            the Backend answers, however many are under way.
 * 2. End     an Action ends with a Message carrying the args it was asked
 *            with, so its id says which write ended. A refusal is kept
 *            beside where it was asked, for the Account it was for.
 * 3. Watch   a wallet watched opens its Window: its entries sync, and the
 *            Entries Query shows them. Unwatched, the Window is let go and
 *            closes after the GC Time; what it stored stays.
 * 4. Elsewhere  a deposit made straight at the Worker, as another device
 *            would, never Confirmed here: its entry arrives only through
 *            its wallet's Window, while it runs.
 */

const Write = Schema.TaggedUnion({
  CreateWallet: {
    account: Schema.String,
    id: Schema.String,
    name: Schema.String,
  },
  Post: {
    account: Schema.String,
    id: Schema.String,
    walletId: Schema.String,
    amount: Schema.Int,
    note: Schema.String,
  },
  Transfer: {
    account: Schema.String,
    id: Schema.String,
    from: Schema.String,
    to: Schema.String,
    amount: Schema.Int,
    note: Schema.String,
  },
  DeleteEntry: { account: Schema.String, id: Schema.String },
});

type Write = typeof Write.Type;

/** Where a refusal shows: a wallet's id, `new` for adding one, `activity` for a delete. */
const atOf = (write: Write) =>
  write._tag === 'Post'
    ? write.walletId
    : write._tag === 'Transfer'
      ? write.from
      : write._tag === 'CreateWallet'
        ? 'new'
        : 'activity';

const Refused = Schema.Struct({
  account: Schema.String,
  at: Schema.String,
  reason: Schema.String,
});

const Watched = Schema.Struct({
  account: Schema.String,
  wallet: Schema.String,
});

const Model = Schema.Struct({
  /** Asked and not ended. */
  writes: Schema.Array(Write),
  refused: Schema.Array(Refused),
  /** The wallets whose entries sync, by Account. */
  watching: Schema.Array(Watched),
});

type Model = typeof Model.Type;

export const PocketSection = Actor.define('Pocket', {
  requires: [Replicas, PocketRpc],
  props: Schema.Struct({
    account: Schema.String,
    /** Only the active Account's Pocket writes: the cookie is its. */
    writable: Schema.Boolean,
  }),
  model: Model,
  message: Schema.TaggedUnion({
    AddWallet: { id: Schema.String, name: Schema.String },
    Change: { id: Schema.String, wallet: Schema.String, amount: Schema.Int },
    Move: {
      id: Schema.String,
      from: Schema.String,
      to: Schema.String,
      amount: Schema.Int,
    },
    Remove: { id: Schema.String },
    Watch: { wallet: Schema.String },
    Elsewhere: { id: Schema.String, wallet: Schema.String },
    CreateWallet: CreateWallet.result,
    Post: Post.result,
    Transfer: Transfer.result,
    DeleteEntry: DeleteEntry.result,
  }),
});

const commandOf = (write: Write) => {
  switch (write._tag) {
    case 'CreateWallet': {
      const { _tag, ...args } = write;
      return CreateWallet(args);
    }
    case 'Post': {
      const { _tag, ...args } = write;
      return Post(args);
    }
    case 'Transfer': {
      const { _tag, ...args } = write;
      return Transfer(args);
    }
    case 'DeleteEntry': {
      const { _tag, ...args } = write;
      return DeleteEntry(args);
    }
  }
};

// 4. Elsewhere
const depositElsewhere = Command.make('DepositElsewhere', {
  args: Schema.Struct({
    account: Schema.String,
    id: Schema.String,
    walletId: Schema.String,
  }),
  run: ({ account, id, walletId }) =>
    Effect.gen(function* () {
      const rpc = yield* PocketRpc;
      yield* rpc.post(account, {
        id,
        walletId,
        amount: 100,
        note: 'From another device',
      });
    }).pipe(
      Effect.catch((error) =>
        Effect.logWarning('A deposit made elsewhere was refused', error),
      ),
    ),
});

const sameSpot = (write: Write) => (refusal: typeof Refused.Type) =>
  refusal.account === write.account && refusal.at === atOf(write);

// 1. Ask
const ask = (model: Model, write: Write) => ({
  model: {
    ...model,
    writes: [...model.writes, write],
    refused: model.refused.filter((each) => !sameSpot(write)(each)),
  },
  command: commandOf(write),
});

// 2. End
const end = (
  model: Model,
  action: Write['_tag'],
  id: string,
  failed: string | null,
) => {
  const done = model.writes.find(
    (each) => each._tag === action && each.id === id,
  );
  if (done === undefined) return { model };
  return {
    model: {
      ...model,
      writes: model.writes.filter((each) => each !== done),
      refused:
        failed === null
          ? model.refused
          : [
              ...model.refused.filter((each) => !sameSpot(done)(each)),
              { account: done.account, at: atOf(done), reason: failed },
            ],
    },
  };
};

// 3. Watch
/** The wallets `account` watches. */
export const watchedBy = (model: Model, account: string) =>
  model.watching
    .filter((each) => each.account === account)
    .map(({ wallet }) => wallet);

const watch = (model: Model, account: string, wallet: string): Model => {
  const at = (each: typeof Watched.Type) =>
    each.account === account && each.wallet === wallet;
  return {
    ...model,
    watching: model.watching.some(at)
      ? model.watching.filter((each) => !at(each))
      : [...model.watching, { account, wallet }],
  };
};

/** The first name `Wallet n` none of `names` has. */
export const nextWalletName = (names: ReadonlyArray<string>) => {
  let n = 1;
  while (names.includes(`Wallet ${n}`)) n++;
  return `Wallet ${n}`;
};

export const PocketLive = Actor.build(PocketSection, {
  init: () => ({ model: { writes: [], refused: [], watching: [] } }),
  children: {
    wallets: {
      actor: Wallets,
      props: ({ props }) => ({ account: props.account }),
    },
    entries: {
      actor: Entries,
      while: ({ model, props }) => watchedBy(model, props.account).length > 0,
      props: ({ model, props }) => ({
        account: props.account,
        wallets: watchedBy(model, props.account),
      }),
    },
  },
  on: {
    AddWallet: ({ id, name }, { model, props }) =>
      props.writable
        ? ask(model, { _tag: 'CreateWallet', account: props.account, id, name })
        : {},
    Change: ({ id, wallet, amount }, { model, props }) =>
      props.writable
        ? ask(model, {
            _tag: 'Post',
            account: props.account,
            id,
            walletId: wallet,
            amount,
            note: '',
          })
        : {},
    Move: ({ id, from, to, amount }, { model, props }) =>
      props.writable
        ? ask(model, {
            _tag: 'Transfer',
            account: props.account,
            id,
            from,
            to,
            amount,
            note: '',
          })
        : {},
    Remove: ({ id }, { model, props }) =>
      props.writable
        ? ask(model, { _tag: 'DeleteEntry', account: props.account, id })
        : {},
    Watch: ({ wallet }, { model, props }) => ({
      model: watch(model, props.account, wallet),
    }),
    Elsewhere: ({ id, wallet }, { props }) =>
      props.writable
        ? {
            command: depositElsewhere({
              account: props.account,
              id,
              walletId: wallet,
            }),
          }
        : {},
    CreateWallet: ({ args, failed }, { model }) =>
      end(model, 'CreateWallet', args.id, failed),
    Post: ({ args, failed }, { model }) => end(model, 'Post', args.id, failed),
    Transfer: ({ args, failed }, { model }) =>
      end(model, 'Transfer', args.id, failed),
    DeleteEntry: ({ args, failed }, { model }) =>
      end(model, 'DeleteEntry', args.id, failed),
  },
});
