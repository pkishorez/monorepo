import { Layer, Schema } from 'effect';
import { HarnessAccountInfo, HarnessInfo } from '@kestack/connect/code';
import { Actor } from '@kestack/kabuki';
import { Connections } from '../../../../../../connections.ts';
import { refreshSetup } from '../../../../../../connection/index.ts';
import { AccountList } from './store.ts';
import { Card } from './card/index.ts';

/*
 * One Connection's Harness Accounts: each login an agent runs as there, with
 * the binary it runs and the config folder it keeps its login in, as its
 * Connection's setup holds them, kept on this device and asked of the Connection
 * behind. Each agent has a Default Account; others, such as a work login
 * of Claude, are added. A change applies to agents started from then on.
 *
 * 1. Shown  the accounts as handed in, or why the Connection could not be
 *           asked, which Retry asks again.
 * 2. Cards  one per account, and one for the account being added, keyed by
 *           the account's id or `new-` and its agent; each edits, saves
 *           and removes its own (card/), through the Connection and then its
 *           setup, and tells the list once it shows (AccountList). One card
 *           is open at a time: tapping its row opens it, and again closes
 *           it; saved, cancelled or removed, it closes.
 * 3. Add    a card for another login of one agent, open, until it is
 *           saved, or closed unsaved, as another opens.
 */

/**
 * The key of the card of the account being added for `harness`, which no
 * account's id, its agent's name alone or with a ULID after it, can be.
 */
const newKeyOf = (harness: Harness) => `new-${harness}`;

type Harness = typeof HarnessInfo.fields.harness.Type;

const Model = Schema.Struct({
  connectionId: Schema.String,
  /** The agent of the account being added, while its card is open. */
  adding: Schema.NullOr(HarnessInfo.fields.harness),
  /** The key of the card open, if any. */
  open: Schema.NullOr(Schema.String),
});
type Model = typeof Model.Type;

const HarnessAccounts = Actor.define('HarnessAccounts', {
  requires: [Connections],
  input: Schema.Struct({ connectionId: Schema.String }),
  props: Schema.Struct({
    /** What its setup holds; null before it knows. */
    accounts: Schema.NullOr(Schema.Array(HarnessAccountInfo.schema)),
    /** Why the Connection could not be asked. */
    problem: Schema.NullOr(Schema.String),
  }),
  model: Model,
  message: Schema.TaggedUnion({
    Retry: {},
    Toggled: { key: Schema.String },
    Closed: { key: Schema.String },
    AddAsked: { harness: HarnessInfo.fields.harness },
  }),
});

/** The card `key` closed, if it is the one open; the account being added, dropped. */
const closed = (model: Model, key: string): Model =>
  model.open !== key
    ? model
    : {
        ...model,
        open: null,
        adding:
          model.adding !== null && key === newKeyOf(model.adding)
            ? null
            : model.adding,
      };

/** The card `key` open, the one open before closed. */
const opened = (model: Model, key: string): Model => ({
  ...(model.open === null ? model : closed(model, model.open)),
  open: key,
});

/**
 * The config folder an account of `harness` with none runs with: its
 * Default Account's, while that one has none set; else not known.
 */
const emptyFolderOf = (
  accounts: ReadonlyArray<typeof HarnessAccountInfo.Type> | null,
  harness: Harness,
) => {
  const own = accounts?.find(
    (each) => each.isDefault && each.harness === harness,
  );
  return own === undefined || own.configFolder !== null
    ? null
    : own.resolvedConfigFolder;
};

export const HarnessAccountsLive = HarnessAccounts.build({
  init: ({ connectionId }) => ({
    model: { connectionId, adding: null, open: null },
  }),
  // 2. Cards
  children: {
    cards: Actor.child(Card.actor, {
      each: ({ model, props }) => [
        ...(props.accounts ?? []).map(({ id }) => id),
        ...(model.adding === null ? [] : [newKeyOf(model.adding)]),
      ],
      input: ({ model, props }, key) => ({
        connectionId: model.connectionId,
        key,
        harness:
          props.accounts?.find(({ id }) => id === key)?.harness ??
          model.adding ??
          'claude',
      }),
      props: ({ model, props }, key) => {
        const account = props.accounts?.find(({ id }) => id === key) ?? null;
        return {
          account,
          empty: emptyFolderOf(
            props.accounts,
            account?.harness ?? model.adding ?? 'claude',
          ),
        };
      },
    }),
  },
  provides: (self) =>
    Layer.succeed(AccountList, {
      closed: (key) => self.send({ _tag: 'Closed', key }),
    }),
  on: {
    // 1. Shown
    Retry: (_, { model }) => ({
      command: refreshSetup({ connectionId: model.connectionId }),
    }),
    Toggled: ({ key }, { model }) => ({
      model: model.open === key ? closed(model, key) : opened(model, key),
    }),
    Closed: ({ key }, { model }) => ({ model: closed(model, key) }),
    // 3. Add
    AddAsked: ({ harness }, { model }) => ({
      model: { ...opened(model, newKeyOf(harness)), adding: harness },
    }),
  },
});
