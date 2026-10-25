import { Schema } from 'effect';
import {
  CodeClients,
  HarnessAccountInfo,
  HarnessInfo,
} from '@kestack/connect/code';
import { Actor } from '@kestack/kabuki';
import { Refused } from '../../../../../machines/index.ts';
import { AccountList } from '../capabilities/index.ts';
import { cancelAccount, removeAccount, saveAccount } from './commands.ts';

/*
 * One Harness Account's card: its name, the binary it runs and the config
 * folder it keeps its login in, as typed, until the Machine saves them.
 * `account` is the account as saved, null for the one being added.
 *
 * 1. Edit    Change opens the card's form, which keeps what is typed;
 *            untouched, it shows the account as saved. Cancel closes it,
 *            or drops the account being added.
 * 2. Save    only once the Machine finds the binary runs and the config
 *            folder is there; refused, the card keeps what was typed and
 *            says why. An empty binary runs the agent from PATH; an empty
 *            folder, the agent's own.
 * 3. Remove  an added account, once asked again; its sessions stop working.
 */

const Form = Schema.Struct({
  name: Schema.String,
  binaryPath: Schema.String,
  configFolder: Schema.String,
});
type Form = typeof Form.Type;

const Field = Schema.Literals(['name', 'binaryPath', 'configFolder']);

const Props = Schema.Struct({ account: Schema.NullOr(HarnessAccountInfo) });
type Props = typeof Props.Type;

const Model = Schema.Struct({
  machineId: Schema.String,
  key: Schema.String,
  harness: HarnessInfo.fields.harness,
  /** What is typed; null shows the account as saved. */
  form: Schema.NullOr(Form),
  /** Why the Machine refused the card. */
  problem: Schema.NullOr(Schema.String),
  /** A save or a remove is running. */
  busy: Schema.Boolean,
  /** The form is open; the account being added always has it open. */
  editing: Schema.Boolean,
  /** Remove was asked once, and waits to be confirmed or kept. */
  confirmingRemove: Schema.Boolean,
});
type Model = typeof Model.Type;

const Card = Actor.define('AccountCard', {
  requires: [CodeClients, AccountList],
  input: Schema.Struct({
    machineId: Schema.String,
    key: Schema.String,
    harness: HarnessInfo.fields.harness,
  }),
  props: Props,
  model: Model,
  message: Schema.TaggedUnion({
    EditAsked: {},
    Edited: { field: Field, value: Schema.String },
    Save: {},
    Cancel: {},
    RemoveAsked: {},
    RemoveKept: {},
    Remove: {},
    Saved: {},
    Removed: {},
    Refused,
  }),
});

/** What the card shows: what is typed in it, else the account as saved. */
export const formOf = (model: Model, props: Props): Form =>
  model.form ?? {
    name: props.account?.name ?? '',
    binaryPath: props.account?.binaryPath ?? '',
    configFolder: props.account?.configFolder ?? '',
  };

const orNull = (value: string) => (value.trim() === '' ? null : value.trim());

export const CardLive = Actor.build(Card, {
  init: ({ machineId, key, harness }) => ({
    model: {
      machineId,
      key,
      harness,
      form: null,
      problem: null,
      busy: false,
      editing: false,
      confirmingRemove: false,
    },
  }),
  on: {
    // 1. Edit
    Edited: ({ field, value }, { model, props }) => ({
      model: {
        ...model,
        form: { ...formOf(model, props), [field]: value },
        problem: null,
      },
    }),
    EditAsked: (_, { model }) => ({ model: { ...model, editing: true } }),
    Cancel: (_, { model, props }) => {
      if (model.busy) return {};
      if (props.account === null) return { command: cancelAccount({}) };
      return {
        model: {
          ...model,
          form: null,
          problem: null,
          editing: false,
          confirmingRemove: false,
        },
      };
    },
    // 2. Save
    Save: (_, { model, props }) => {
      if (model.busy) return {};
      const form = formOf(model, props);
      if (form.name.trim() === '')
        return { model: { ...model, problem: 'Give the account a name' } };
      return {
        model: { ...model, busy: true },
        command: saveAccount({
          machineId: model.machineId,
          key: model.key,
          id: props.account?.id ?? null,
          harness: model.harness,
          name: form.name.trim(),
          binaryPath: orNull(form.binaryPath),
          configFolder: orNull(form.configFolder),
        }),
      };
    },
    Saved: (_, { model }) => ({
      model: {
        ...model,
        busy: false,
        form: null,
        problem: null,
        editing: false,
      },
    }),
    Refused: ({ reason }, { model }) => ({
      model: { ...model, busy: false, problem: reason },
    }),
    // 3. Remove
    RemoveAsked: (_, { model }) =>
      model.busy ? {} : { model: { ...model, confirmingRemove: true } },
    RemoveKept: (_, { model }) => ({
      model: { ...model, confirmingRemove: false },
    }),
    Remove: (_, { model, props }) =>
      model.busy || !model.confirmingRemove || props.account === null
        ? {}
        : {
            model: { ...model, busy: true, confirmingRemove: false },
            command: removeAccount({
              machineId: model.machineId,
              id: props.account.id,
            }),
          },
    Removed: (_, { model }) => ({ model: { ...model, busy: false } }),
  },
});
