import { Schema } from 'effect';
import { Actor } from '@kestack/kabuki';
import { HarnessAccountInfo, SpeechToTextState } from '@kestack/connect/code';
import { CloudClient, Connection } from '@kestack/connect/cloud';
import { Connections } from '../../../../account.ts';
import { ConnectionCards } from '../store.ts';
import { Agents } from './agents/index.ts';
import { Speech } from './speech/index.ts';
import { askForget, rename } from './commands.ts';

/*
 * One Connection in Settings → Connections: its card, standing as the sidebar
 * says it, and its own settings, as its Connection's setup holds them, handed
 * in by the list.
 *
 * 1. Shown   its Agents: its Harness Accounts (`agents/`) and its
 *            Speech to Text switch (`speech/`), each handed what its setup
 *            holds. Its Projects are not shown: they are never managed.
 * 2. Rename  its Display Name, typed in place of its name: saved to Connect
 *            Cloud, so it is renamed even while out of reach; left
 *            empty, it goes back to its Computer Name. Refused, it says why
 *            and keeps what was typed.
 * 3. Forget  asked of the list (`ConnectionCards`), which asks first.
 */

const Renaming = Schema.NullOr(
  Schema.Struct({
    /** What is typed. */
    text: Schema.String,
    /** Whether Connect Cloud is being asked. */
    saving: Schema.Boolean,
    /** Why Connect Cloud refused it. */
    problem: Schema.NullOr(Schema.String),
  }),
);

const Card = Actor.define('ConnectionCard', {
  requires: [ConnectionCards, CloudClient, Connections],
  input: Schema.Struct({ connectionId: Schema.String }),
  props: Schema.Struct({
    connection: Connection.schema,
    /** What its setup holds; null before it knows. */
    accounts: Schema.NullOr(Schema.Array(HarnessAccountInfo.schema)),
    speech: Schema.NullOr(SpeechToTextState.schema),
    /** Why its Connection could not be asked. */
    problem: Schema.NullOr(Schema.String),
  }),
  model: Schema.Struct({
    connectionId: Schema.String,
    /** Its name being changed; null while it is not. */
    renaming: Renaming,
  }),
  message: {
    RenameAsked: Schema.Struct({}).annotate({
      description:
        "Opens this Connection's Display Name for editing, filled with the current one; then NameTyped and RenameSaved, or RenameCancelled.",
    }),
    NameTyped: Schema.Struct({ text: Schema.String }).annotate({
      description:
        'Replaces the Display Name typed so far with text, at most 64 characters; only after RenameAsked, and not while it saves.',
    }),
    RenameCancelled: Schema.Struct({}).annotate({
      description:
        'Closes the Display Name field without saving, as Escape or Cancel does; not while it saves.',
    }),
    RenameSaved: Schema.Struct({}).annotate({
      description:
        'Saves the typed Display Name to Connect Cloud, even while the Connection is out of reach; empty goes back to its Computer Name.',
    }),
    Renamed: {},
    RenameFailed: { problem: Schema.String },
    ForgetAsked: Schema.Struct({}).annotate({
      description:
        "Forgets this Connection: asks first; Cards' Forget confirms, Keep keeps it.",
    }),
  },
});

/** A typed Display Name as kept: trimmed, and none when left empty. */
export const displayNameOf = (text: string) => text.trim() || null;

export const CardLive = Card.build({
  init: ({ connectionId }) => ({ model: { connectionId, renaming: null } }),
  // 1. Shown
  children: {
    agents: Actor.child(Agents.actor, {
      input: ({ model }) => ({ connectionId: model.connectionId }),
      props: ({ props }) => ({
        accounts: props.accounts,
        problem: props.problem,
      }),
    }),
    speech: Actor.child(Speech.actor, {
      input: ({ model }) => ({ connectionId: model.connectionId }),
      props: ({ props }) => ({ speech: props.speech }),
    }),
  },
  on: {
    // 2. Rename
    RenameAsked: (_, { model, props }) =>
      model.renaming !== null
        ? {}
        : {
            model: {
              ...model,
              renaming: {
                text: props.connection.displayName ?? '',
                saving: false,
                problem: null,
              },
            },
          },
    NameTyped: ({ text }, { model }) =>
      model.renaming === null || model.renaming.saving
        ? {}
        : { model: { ...model, renaming: { ...model.renaming, text } } },
    RenameCancelled: (_, { model }) =>
      model.renaming?.saving === true
        ? {}
        : { model: { ...model, renaming: null } },
    RenameSaved: (_, { model, props }) => {
      if (model.renaming === null || model.renaming.saving) return {};
      const displayName = displayNameOf(model.renaming.text);
      if (displayName === props.connection.displayName)
        return { model: { ...model, renaming: null } };
      return {
        model: {
          ...model,
          renaming: { ...model.renaming, saving: true, problem: null },
        },
        command: rename({ id: model.connectionId, displayName }),
      };
    },
    Renamed: (_, { model }) => ({ model: { ...model, renaming: null } }),
    RenameFailed: ({ problem }, { model }) =>
      model.renaming === null
        ? {}
        : {
            model: {
              ...model,
              renaming: { ...model.renaming, saving: false, problem },
            },
          },
    // 3. Forget
    ForgetAsked: (_, { model }) => ({
      command: askForget({ id: model.connectionId }),
    }),
  },
});
