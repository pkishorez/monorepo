import { Effect, Schema } from 'effect';
import {
  CodeClients,
  HarnessAccountInfo,
  HarnessInfo,
} from '@kestack/connect/code';
import { Actor } from '@kestack/kabuki';
import { Refused } from '../../../../machines/index.ts';
import { loadAccounts } from './api.ts';
import { removeHarnessAccount, saveHarnessAccount } from './commands.ts';

/*
 * One Machine's Harness Accounts: each login an agent runs as there, with
 * the binary it runs and the config folder it keeps its login in; read and
 * set over that Machine's own socket, each Machine on its own. Each agent
 * has a Default Account; others, such as a work login of Claude, are
 * added.
 *
 * 1. Read    every account once: what it is set to, and what its binary
 *            resolved to. A Machine that does not answer is asked until it
 *            does.
 * 2. Edit    each card keeps what is typed in it, by its key: an account's
 *            id, or `new` for the one being added.
 * 3. Save    an account is saved only once the Machine finds its binary
 *            runs and its config folder is there; refused, the card keeps
 *            what was typed and says why. An empty binary runs the agent
 *            from PATH; an empty folder, the agent's own.
 * 4. Remove  an added account, once asked again; its sessions stop working.
 * A change applies to agents started from then on.
 */

const Name = HarnessInfo.fields.name;

/** The card of the account being added. */
export const NEW = 'new';

const Form = Schema.Struct({
  name: Schema.String,
  binaryPath: Schema.String,
  home: Schema.String,
});
type Form = typeof Form.Type;

const Field = Schema.Literals(['name', 'binaryPath', 'home']);

const Model = Schema.Struct({
  machineId: Schema.String,
  accounts: Schema.NullOr(Schema.Array(HarnessAccountInfo)),
  loadProblem: Schema.NullOr(Schema.String),
  /** What is typed in each card, by key; absent, the account as saved. */
  forms: Schema.Record(Schema.String, Form),
  /** The agent of the account being added, while its card is open. */
  adding: Schema.NullOr(Name),
  /** The card being saved or removed. */
  saving: Schema.NullOr(Schema.String),
  /** The account asked to be removed, until it is confirmed or kept. */
  removing: Schema.NullOr(Schema.String),
  /** Why the Machine refused each card, by key. */
  problems: Schema.Record(Schema.String, Schema.String),
});
type Model = typeof Model.Type;

const HarnessAccounts = Actor.define('HarnessAccounts', {
  requires: [CodeClients],
  input: Schema.Struct({ machineId: Schema.String }),
  model: Model,
  message: Schema.TaggedUnion({
    AccountsLoaded: { accounts: Schema.Array(HarnessAccountInfo) },
    Refused,
    Retry: {},
    Edited: { key: Schema.String, field: Field, value: Schema.String },
    AddAsked: { harness: Name },
    AddCancelled: {},
    Save: { key: Schema.String },
    RemoveAsked: { id: Schema.String },
    RemoveKept: {},
    Remove: { id: Schema.String },
    AccountSaved: { key: Schema.String, account: HarnessAccountInfo },
    AccountRefused: { key: Schema.String, reason: Schema.String },
    AccountRemoved: { id: Schema.String },
  }),
});

const without = <A>(record: Record<string, A>, key: string) =>
  Object.fromEntries(Object.entries(record).filter(([each]) => each !== key));

/** What a card shows: what is typed in it, else the account as saved. */
export const formOf = (model: Model, key: string): Form => {
  const typed = model.forms[key];
  if (typed !== undefined) return typed;
  const account = model.accounts?.find((each) => each.id === key);
  return {
    name: account?.name ?? '',
    binaryPath: account?.binaryPath ?? '',
    home: account?.home ?? '',
  };
};

const orNull = (value: string) => (value.trim() === '' ? null : value.trim());

export const HarnessAccountsLive = Actor.build(HarnessAccounts, {
  init: ({ machineId }) => ({
    model: {
      machineId,
      accounts: null,
      loadProblem: null,
      forms: {},
      adding: null,
      saving: null,
      removing: null,
      problems: {},
    },
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
  on: {
    AccountsLoaded: ({ accounts }, { model }) => ({
      model: { ...model, accounts },
    }),
    Refused: ({ reason }, { model }) => ({
      model: { ...model, loadProblem: reason },
    }),
    Retry: (_, { model }) => ({ model: { ...model, loadProblem: null } }),
    // 2. Edit
    Edited: ({ key, field, value }, { model }) => ({
      model: {
        ...model,
        forms: {
          ...model.forms,
          [key]: { ...formOf(model, key), [field]: value },
        },
        problems: without(model.problems, key),
      },
    }),
    AddAsked: ({ harness }, { model }) => ({
      model: {
        ...model,
        adding: harness,
        forms: without(model.forms, NEW),
        problems: without(model.problems, NEW),
      },
    }),
    AddCancelled: (_, { model }) =>
      model.saving === NEW ? {} : { model: { ...model, adding: null } },
    // 3. Save
    Save: ({ key }, { model }) => {
      if (model.saving !== null) return {};
      const account =
        key === NEW ? null : model.accounts?.find((each) => each.id === key);
      const harness = key === NEW ? model.adding : account?.harness;
      if (harness === null || harness === undefined) return {};
      const form = formOf(model, key);
      if (form.name.trim() === '')
        return {
          model: {
            ...model,
            problems: { ...model.problems, [key]: 'Give the account a name' },
          },
        };
      return {
        model: { ...model, saving: key },
        command: saveHarnessAccount({
          machineId: model.machineId,
          key,
          id: account?.id ?? null,
          harness,
          name: form.name.trim(),
          binaryPath: orNull(form.binaryPath),
          home: orNull(form.home),
        }),
      };
    },
    // 4. Remove
    RemoveAsked: ({ id }, { model }) =>
      model.saving !== null ? {} : { model: { ...model, removing: id } },
    RemoveKept: (_, { model }) => ({ model: { ...model, removing: null } }),
    Remove: ({ id }, { model }) =>
      model.saving !== null || model.removing !== id
        ? {}
        : {
            model: { ...model, saving: id, removing: null },
            command: removeHarnessAccount({ machineId: model.machineId, id }),
          },
    AccountSaved: ({ key, account }, { model }) => {
      const accounts = model.accounts ?? [];
      return {
        model: {
          ...model,
          saving: null,
          adding: key === NEW ? null : model.adding,
          accounts:
            key === NEW
              ? [...accounts, account]
              : accounts.map((each) =>
                  each.id === account.id ? account : each,
                ),
          forms: without(model.forms, key),
          problems: without(model.problems, key),
        },
      };
    },
    AccountRefused: ({ key, reason }, { model }) => ({
      model: {
        ...model,
        saving: null,
        problems: { ...model.problems, [key]: reason },
      },
    }),
    AccountRemoved: ({ id }, { model }) => ({
      model: {
        ...model,
        saving: null,
        accounts: (model.accounts ?? []).filter((each) => each.id !== id),
        forms: without(model.forms, id),
        problems: without(model.problems, id),
      },
    }),
  },
});
