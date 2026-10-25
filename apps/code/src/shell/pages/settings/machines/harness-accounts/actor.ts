import { Effect, Layer, Schema } from 'effect';
import {
  CodeClients,
  HarnessAccountInfo,
  HarnessInfo,
} from '@kestack/connect/code';
import { Actor } from '@kestack/kabuki';
import { Refused } from '../../../../machines/index.ts';
import { loadAccounts } from './api.ts';
import { AccountList } from './capabilities/index.ts';
import { Card } from './card/index.ts';

/*
 * One Machine's Harness Accounts: each login an agent runs as there, with
 * the binary it runs and the config folder it keeps its login in; read and
 * set over that Machine's own socket, each Machine on its own. Each agent
 * has a Default Account; others, such as a work login of Claude, are
 * added. A change applies to agents started from then on.
 *
 * 1. Read   every account once: what it is set to, and what its binary
 *           resolved to. A Machine that does not answer is asked until it
 *           does.
 * 2. Cards  one per account, and one for the account being added, keyed by
 *           the account's id or `new`; each edits, saves and removes its
 *           own (card/), and tells the list what the Machine did
 *           (AccountList).
 * 3. Add    a card for another login of one agent, until it is saved or
 *           cancelled.
 */

/** The key of the card of the account being added. */
const NEW = 'new';

const Model = Schema.Struct({
  machineId: Schema.String,
  accounts: Schema.NullOr(Schema.Array(HarnessAccountInfo)),
  loadProblem: Schema.NullOr(Schema.String),
  /** The agent of the account being added, while its card is open. */
  adding: Schema.NullOr(HarnessInfo.fields.harness),
});

const HarnessAccounts = Actor.define('HarnessAccounts', {
  requires: [CodeClients],
  input: Schema.Struct({ machineId: Schema.String }),
  model: Model,
  message: Schema.TaggedUnion({
    AccountsLoaded: { accounts: Schema.Array(HarnessAccountInfo) },
    Refused,
    Retry: {},
    AddAsked: { harness: HarnessInfo.fields.harness },
    AddCancelled: {},
    AccountSaved: { key: Schema.String, account: HarnessAccountInfo },
    AccountRemoved: { id: Schema.String },
  }),
});

export const HarnessAccountsLive = Actor.build(HarnessAccounts, {
  init: ({ machineId }) => ({
    model: { machineId, accounts: null, loadProblem: null, adding: null },
  }),
  workers: {
    // 1. Read
    accounts: {
      while: ({ model }) =>
        model.accounts === null && model.loadProblem === null,
      run: (self) =>
        Effect.flatMap(self.get, ({ model }) =>
          Effect.flatMap(loadAccounts(model.machineId), self.send),
        ),
    },
  },
  // 2. Cards
  children: {
    cards: {
      actor: Card.actor,
      each: ({ model }) => [
        ...(model.accounts ?? []).map(({ id }) => id),
        ...(model.adding === null ? [] : [NEW]),
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
      cancelled: self.send({ _tag: 'AddCancelled' }),
    }),
  on: {
    AccountsLoaded: ({ accounts }, { model }) => ({
      model: { ...model, accounts },
    }),
    Refused: ({ reason }, { model }) => ({
      model: { ...model, loadProblem: reason },
    }),
    Retry: (_, { model }) => ({ model: { ...model, loadProblem: null } }),
    AccountSaved: ({ key, account }, { model }) => {
      const accounts = model.accounts ?? [];
      return {
        model: {
          ...model,
          adding: key === NEW ? null : model.adding,
          accounts:
            key === NEW
              ? [...accounts, account]
              : accounts.map((each) =>
                  each.id === account.id ? account : each,
                ),
        },
      };
    },
    AccountRemoved: ({ id }, { model }) => ({
      model: {
        ...model,
        accounts: (model.accounts ?? []).filter((each) => each.id !== id),
      },
    }),
    // 3. Add
    AddAsked: ({ harness }, { model }) => ({
      model: { ...model, adding: harness },
    }),
    AddCancelled: (_, { model }) => ({ model: { ...model, adding: null } }),
  },
});
