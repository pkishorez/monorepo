import { Schema } from 'effect';
import { Actor } from '@kestack/kabuki';
import { Action, Replicas } from '@kestack/std-toolkit/replica';
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
 * 1. Ask     a write joins the queue for its Action, and runs at once
 *            unless one of that Action is under way.
 * 2. End     an Action ends with a Message naming only the Action, so one
 *            of each runs at a time: the one under way is the one that
 *            ended. A refusal is kept beside where it was asked, for the
 *            Account it was for; the next of that Action runs.
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

const Model = Schema.Struct({
  /** Asked and not ended, in order; the first of each Action is under way. */
  writes: Schema.Array(Write),
  refused: Schema.Array(Refused),
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
    CreateWallet: Action.result,
    Post: Action.result,
    Transfer: Action.result,
    DeleteEntry: Action.result,
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

const sameSpot = (write: Write) => (refusal: typeof Refused.Type) =>
  refusal.account === write.account && refusal.at === atOf(write);

// 1. Ask
const ask = (model: Model, write: Write) => {
  const busy = model.writes.some(({ _tag }) => _tag === write._tag);
  return {
    model: {
      writes: [...model.writes, write],
      refused: model.refused.filter((each) => !sameSpot(write)(each)),
    },
    ...(busy ? {} : { command: commandOf(write) }),
  };
};

// 2. End
const end = (model: Model, action: Write['_tag'], failed: string | null) => {
  const done = model.writes.find(({ _tag }) => _tag === action);
  if (done === undefined) return { model };
  const writes = model.writes.filter((each) => each !== done);
  const next = writes.find(({ _tag }) => _tag === action);
  return {
    model: {
      writes,
      refused:
        failed === null
          ? model.refused
          : [
              ...model.refused.filter((each) => !sameSpot(done)(each)),
              { account: done.account, at: atOf(done), reason: failed },
            ],
    },
    ...(next ? { command: commandOf(next) } : {}),
  };
};

/** The first name `Wallet n` none of `names` has. */
export const nextWalletName = (names: ReadonlyArray<string>) => {
  let n = 1;
  while (names.includes(`Wallet ${n}`)) n++;
  return `Wallet ${n}`;
};

export const PocketLive = Actor.build(PocketSection, {
  init: () => ({ model: { writes: [], refused: [] } }),
  children: {
    wallets: {
      actor: Wallets,
      props: ({ props }) => ({ account: props.account }),
    },
    entries: {
      actor: Entries,
      props: ({ props }) => ({ account: props.account }),
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
    CreateWallet: ({ failed }, { model }) => end(model, 'CreateWallet', failed),
    Post: ({ failed }, { model }) => end(model, 'Post', failed),
    Transfer: ({ failed }, { model }) => end(model, 'Transfer', failed),
    DeleteEntry: ({ failed }, { model }) => end(model, 'DeleteEntry', failed),
  },
});
