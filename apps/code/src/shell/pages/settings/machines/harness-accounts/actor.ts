import { Effect, Layer, Schema } from 'effect';
import {
  CodeClients,
  HarnessAccountInfo,
  HarnessInfo,
} from '@kestack/connect/code';
import { Actor } from '@kestack/kabuki';
import { SavedMachines } from '../../../../../layer/capabilities/index.ts';
import { Refused } from '../../../../machines/index.ts';
import { loadAccounts } from './api.ts';
import { AccountList } from './capabilities/index.ts';
import { Card } from './card/index.ts';
import { keepHarnessAccounts } from './commands.ts';

/*
 * One Machine's Harness Accounts: each login an agent runs as there, with
 * the binary it runs and the config folder it keeps its login in; read and
 * set over that Machine's own socket, each Machine on its own. Each agent
 * has a Default Account; others, such as a work login of Claude, are
 * added. A change applies to agents started from then on.
 *
 * 1. Kept   what the Machine last said of them, as kept on this device
 *           for its Account and handed in, shown at once.
 * 2. Read   every account, asked once behind what is shown: what it is
 *           set to, and what its binary resolved to. A Machine that does
 *           not answer is asked until it does; its answer replaces what is
 *           shown, and is kept. A card changed while it is asked asks
 *           again, so an answer older than the change never undoes it.
 * 3. Cards  one per account, and one for the account being added, keyed by
 *           the account's id or `new-` and its agent; each edits, saves
 *           and removes its own (card/), and tells the list what the
 *           Machine did (AccountList), which keeps the list as it now
 *           stands. One card is open at a time: tapping its row opens it,
 *           and again closes it; saved, cancelled or removed, it closes.
 * 4. Add    a card for another login of one agent, open, until it is
 *           saved, or closed unsaved, as another opens.
 */

/**
 * The key of the card of the account being added for `harness`, which no
 * account's id, its agent's name alone or with a ULID after it, can be.
 */
export const newKeyOf = (harness: Harness) => `new-${harness}`;
const isNew = (key: string) => key.startsWith('new-');

type Harness = typeof HarnessInfo.fields.harness.Type;

const Model = Schema.Struct({
  machineId: Schema.String,
  accountId: Schema.String,
  /** What is shown: kept on this device, or as the Machine said; null before either. */
  accounts: Schema.NullOr(Schema.Array(HarnessAccountInfo)),
  /** Whether the Machine has said since this was opened. */
  heard: Schema.Boolean,
  /** How many accounts the Machine has saved or removed since this was opened. */
  changes: Schema.Finite,
  loadProblem: Schema.NullOr(Schema.String),
  /** The agent of the account being added, while its card is open. */
  adding: Schema.NullOr(HarnessInfo.fields.harness),
  /** The key of the card open, if any. */
  open: Schema.NullOr(Schema.String),
});
type Model = typeof Model.Type;

const HarnessAccounts = Actor.define('HarnessAccounts', {
  requires: [CodeClients, SavedMachines],
  input: Schema.Struct({
    machineId: Schema.String,
    accountId: Schema.String,
    /** What this device kept of them; null if nothing. */
    kept: Schema.NullOr(Schema.Array(HarnessAccountInfo)),
  }),
  model: Model,
  message: Schema.TaggedUnion({
    AccountsLoaded: {
      accounts: Schema.Array(HarnessAccountInfo),
      since: Schema.Finite,
    },
    Refused,
    Retry: {},
    Toggled: { key: Schema.String },
    Closed: { key: Schema.String },
    AddAsked: { harness: HarnessInfo.fields.harness },
    AccountSaved: { key: Schema.String, account: HarnessAccountInfo },
    AccountRemoved: { id: Schema.String },
  }),
});

/** The Machine's accounts as they now stand, kept for its Account. */
const keep = (model: Model, accounts: ReadonlyArray<HarnessAccountInfo>) =>
  keepHarnessAccounts({
    accountId: model.accountId,
    machineId: model.machineId,
    accounts,
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

export const HarnessAccountsLive = Actor.build(HarnessAccounts, {
  init: ({ machineId, accountId, kept }) => ({
    model: {
      machineId,
      accountId,
      accounts: kept,
      heard: false,
      changes: 0,
      loadProblem: null,
      adding: null,
      open: null,
    },
  }),
  workers: {
    // 2. Read
    accounts: {
      each: ({ model }) =>
        !model.heard && model.loadProblem === null
          ? [String(model.changes)]
          : [],
      run: (self, since) =>
        Effect.flatMap(self.get, ({ model }) =>
          Effect.flatMap(
            loadAccounts(model.machineId, Number(since)),
            self.send,
          ),
        ),
    },
  },
  // 3. Cards
  children: {
    cards: {
      actor: Card.actor,
      each: ({ model }) => [
        ...(model.accounts ?? []).map(({ id }) => id),
        ...(model.adding === null ? [] : [newKeyOf(model.adding)]),
      ],
      input: ({ model }, key) => ({
        machineId: model.machineId,
        key,
        harness:
          model.accounts?.find(({ id }) => id === key)?.harness ??
          model.adding ??
          'claude',
      }),
      props: ({ model }, key) => ({
        account: model.accounts?.find(({ id }) => id === key) ?? null,
      }),
    },
  },
  provides: (self) =>
    Layer.succeed(AccountList, {
      saved: (key, account) =>
        self.send({ _tag: 'AccountSaved', key, account }),
      removed: (id) => self.send({ _tag: 'AccountRemoved', id }),
      closed: (key) => self.send({ _tag: 'Closed', key }),
    }),
  on: {
    // 2. Read: an answer asked before the latest change is dropped.
    AccountsLoaded: ({ accounts, since }, { model }) =>
      since === model.changes
        ? {
            model: { ...model, accounts, heard: true },
            command: keep(model, accounts),
          }
        : {},
    Refused: ({ reason }, { model }) => ({
      model: { ...model, loadProblem: reason },
    }),
    Retry: (_, { model }) => ({ model: { ...model, loadProblem: null } }),
    AccountSaved: ({ key, account }, { model }) => {
      const before = model.accounts ?? [];
      const accounts = isNew(key)
        ? [...before, account]
        : before.map((each) => (each.id === account.id ? account : each));
      return {
        model: {
          ...closed(model, key),
          accounts,
          changes: model.changes + 1,
        },
        command: keep(model, accounts),
      };
    },
    AccountRemoved: ({ id }, { model }) => {
      const accounts = (model.accounts ?? []).filter((each) => each.id !== id);
      return {
        model: { ...closed(model, id), accounts, changes: model.changes + 1 },
        command: keep(model, accounts),
      };
    },
    Toggled: ({ key }, { model }) => ({
      model: model.open === key ? closed(model, key) : opened(model, key),
    }),
    Closed: ({ key }, { model }) => ({ model: closed(model, key) }),
    // 4. Add
    AddAsked: ({ harness }, { model }) => ({
      model: { ...opened(model, newKeyOf(harness)), adding: harness },
    }),
  },
});
