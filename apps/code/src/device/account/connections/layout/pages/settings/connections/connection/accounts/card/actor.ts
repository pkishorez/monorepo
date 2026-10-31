import { Schema } from 'effect';
import {
  CodeClients,
  HarnessAccountInfo,
  HarnessInfo,
} from '@kestack/connect/code';
import { Actor } from '@kestack/kabuki';
import { Connections } from '../../../../../../../connections.ts';
import { Refused } from '../../../../../../../connection/link/index.ts';
import { AccountList } from '../store.ts';
import { closeAccount, removeAccount, saveAccount } from './commands.ts';

/*
 * One Harness Account's card: its name, the binary it runs and the config
 * folder it keeps its login in, as typed, until the Connection saves them.
 * `account` is the account as saved, null for the one being added. The
 * list opens and closes it (AccountList); saved or removed, it closes
 * once the Connection's setup shows it.
 *
 * 1. Edit    its form keeps what is typed, closed or open; untouched, it
 *            shows the account as saved. Cancel drops what was typed and
 *            closes it, or drops the account being added.
 * 2. Save    only once the Connection finds the binary runs and the config
 *            folder is there; refused, the card keeps what was typed and
 *            says why. An empty binary runs the agent from PATH; an empty
 *            folder, the agent's own.
 * 3. Remove  an added account, once its View has asked again; its sessions
 *            stop working.
 */

const Form = Schema.Struct({
  name: Schema.String,
  binaryPath: Schema.String,
  configFolder: Schema.String,
});
type Form = typeof Form.Type;

const Field = Schema.Literals(['name', 'binaryPath', 'configFolder']);

/** A config folder in use, as a Connection says it. */
const ConfigFolder = Schema.toType(
  HarnessAccountInfo.fields.resolvedConfigFolder,
);

const Props = Schema.Struct({
  account: Schema.NullOr(HarnessAccountInfo.schema),
  /**
   * The config folder an account of this agent with none runs with, as
   * its Default Account with none says; null when that is not known.
   */
  empty: Schema.NullOr(ConfigFolder),
});
type Props = typeof Props.Type;

const Model = Schema.Struct({
  connectionId: Schema.String,
  key: Schema.String,
  harness: HarnessInfo.fields.harness,
  /** What is typed; null shows the account as saved. */
  form: Schema.NullOr(Form),
  /** Why the Connection refused the card. */
  problem: Schema.NullOr(Schema.String),
  /** A save or a remove is running. */
  busy: Schema.Boolean,
});
type Model = typeof Model.Type;

const Card = Actor.define('AccountCard', {
  requires: [CodeClients, Connections, AccountList],
  input: Schema.Struct({
    connectionId: Schema.String,
    key: Schema.String,
    harness: HarnessInfo.fields.harness,
  }),
  props: Props,
  model: Model,
  message: Schema.TaggedUnion({
    Edited: { field: Field, value: Schema.String },
    Save: {},
    Cancel: {},
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

export const CardLive = Card.build({
  init: ({ connectionId, key, harness }) => ({
    model: {
      connectionId,
      key,
      harness,
      form: null,
      problem: null,
      busy: false,
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
    Cancel: (_, { model }) =>
      model.busy
        ? {}
        : {
            model: { ...model, form: null, problem: null },
            command: closeAccount({ key: model.key }),
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
          connectionId: model.connectionId,
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
      },
    }),
    Refused: ({ reason }, { model }) => ({
      model: { ...model, busy: false, problem: reason },
    }),
    // 3. Remove
    Remove: (_, { model, props }) =>
      model.busy || props.account === null
        ? {}
        : {
            model: { ...model, busy: true },
            command: removeAccount({
              connectionId: model.connectionId,
              id: props.account.id,
            }),
          },
    Removed: (_, { model }) => ({ model: { ...model, busy: false } }),
  },
});
