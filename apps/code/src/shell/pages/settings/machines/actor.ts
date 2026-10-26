import { Effect, Schema, Stream } from 'effect';
import { Actor } from '@kestack/kabuki';
import {
  HarnessAccountInfo,
  Machine,
  SpeechToTextState,
} from '@kestack/connect/code';
import {
  Machines,
  SavedMachines,
} from '../../../../layer/capabilities/index.ts';
import { HarnessAccounts } from './harness-accounts/index.ts';
import { SpeechToText } from './speech-to-text/index.ts';
import { ask, keepForgetting } from './commands.ts';

/*
 * Settings → Machines: the signed-in Account's Machines as the Machine
 * List holds them, so the list never waits for a Machine, each standing as
 * the sidebar says it, by its Line and Last Seen; and each Machine's own
 * settings, shown as last kept on this device and asked of the Machine
 * behind, each on its own.
 *
 * 1. Read    what `Machines` holds, followed, and what this device kept
 *            of each listed Machine's settings; nothing is drawn until the
 *            list kept here and every one of those has been read, so the
 *            page draws once. Then one child per Machine for each of its
 *            settings, its Harness Accounts and its Speech to Text switch,
 *            each told whose Machine it is and what was kept of it, and
 *            none while no Account is known. Reload asks the Machine List
 *            again, as the sidebar's does.
 * 2. Ask     Forget asks first, saying when the Machine was last seen and
 *            how its tunnel stands.
 * 3. Forget  confirmed, the Machine List forgets it: Cloud Connect first,
 *            then its records on this device. Once it is gone from the
 *            list the question closes; refused, it says why.
 */

const Forgetting = Schema.NullOr(
  Schema.Struct({ id: Schema.String, problem: Schema.NullOr(Schema.String) }),
);

/** What it follows of `Machines`. */
const Known = Schema.Struct({
  accountId: Schema.NullOr(Schema.String),
  machines: Schema.NullOr(Schema.Array(Machine)),
  savedRead: Schema.Boolean,
  fetchedAt: Schema.NullOr(Schema.Number),
  forgetting: Forgetting,
});
const sameKnown = Schema.toEquivalence(Known);

/** A Machine's settings as this device kept them. */
const Kept = Schema.Struct({
  accounts: Schema.NullOr(Schema.Array(HarnessAccountInfo)),
  speech: Schema.NullOr(SpeechToTextState),
});

const Model = Schema.Struct({
  /** Whether `Machines` has said anything yet. */
  heard: Schema.Boolean,
  accountId: Schema.NullOr(Schema.String),
  machines: Schema.NullOr(Schema.Array(Machine)),
  savedRead: Schema.Boolean,
  fetchedAt: Schema.NullOr(Schema.Number),
  forgetting: Forgetting,
  /** What was kept of each listed Machine's settings, by its key, once read. */
  kept: Schema.Record(Schema.String, Kept),
  /** Whether the page has been drawn: from then on it never waits again. */
  drawn: Schema.Boolean,
  /** The Machine Forget is asking about. */
  asking: Schema.NullOr(Schema.String),
});
type Model = typeof Model.Type;

export const MachineSettings = Actor.define('MachineSettings', {
  requires: [Machines, SavedMachines],
  model: Model,
  message: Schema.TaggedUnion({
    Known: Known.fields,
    KeptRead: { key: Schema.String, kept: Kept },
    Ask: { id: Schema.String },
    Keep: {},
    Forget: {},
    Reload: {},
  }),
});

/**
 * A per-Machine child's key: its Account's id and its Machine's, which no
 * id holds a space of, so a child is never told an Account it is not of.
 */
export const keyOf = (accountId: string, machineId: string) =>
  `${accountId} ${machineId}`;

/** Each listed Machine's key, none while no Account is known. */
const keysOf = ({
  accountId,
  machines,
}: {
  readonly accountId: string | null;
  readonly machines: ReadonlyArray<{ readonly id: string }> | null;
}) =>
  accountId === null
    ? []
    : (machines ?? []).map(({ id }) => keyOf(accountId, id));

/** The Account and the Machine a key names. */
const whoseOf = (key: string) => {
  const at = key.indexOf(' ');
  return { accountId: key.slice(0, at), machineId: key.slice(at + 1) };
};

/** Each listed Machine's key whose kept settings have been read. */
const readKeysOf = (model: Model) =>
  keysOf(model).filter((key) => model.kept[key] !== undefined);

/**
 * Whether what this device kept has been read: the list, unless Cloud
 * Connect's came first, and each listed Machine's settings.
 */
const readAll = (model: Model) =>
  (model.savedRead || model.machines !== null) &&
  keysOf(model).every((key) => model.kept[key] !== undefined);

export const MachineSettingsLive = Actor.build(MachineSettings, {
  init: () => ({
    model: {
      heard: false,
      accountId: null,
      machines: null,
      savedRead: false,
      fetchedAt: null,
      forgetting: null,
      kept: {},
      drawn: false,
      asking: null,
    },
  }),
  children: {
    accounts: {
      actor: HarnessAccounts.actor,
      each: ({ model }) => readKeysOf(model),
      input: ({ model }, key) => ({
        ...whoseOf(key),
        kept: model.kept[key]?.accounts ?? null,
      }),
    },
    speech: {
      actor: SpeechToText.actor,
      each: ({ model }) => readKeysOf(model),
      input: ({ model }, key) => ({
        ...whoseOf(key),
        kept: model.kept[key]?.speech ?? null,
      }),
    },
  },
  workers: {
    // 1. Read
    known: {
      run: (self) =>
        // The list and Forget only, so a line or a download changes
        // nothing here: each Machine's own settings follow those.
        Effect.flatMap(Machines, ({ state }) =>
          state.pipe(
            Stream.map(
              ({ accountId, machines, savedRead, fetchedAt, forgetting }) => ({
                accountId,
                machines,
                savedRead,
                fetchedAt,
                forgetting,
              }),
            ),
            Stream.changesWith(sameKnown),
            Stream.runForEach((known) =>
              self.send({ _tag: 'Known', ...known }),
            ),
          ),
        ),
    },
    kept: {
      each: ({ model }) =>
        keysOf(model).filter((key) => model.kept[key] === undefined),
      run: (self, key) =>
        Effect.gen(function* () {
          const { accountId, machineId } = whoseOf(key);
          const saved = yield* SavedMachines;
          const kept = yield* saved.settings(accountId, machineId);
          yield* self.send({ _tag: 'KeptRead', key, kept });
        }),
    },
  },
  on: {
    Known: (known, { model }) => {
      const next = {
        ...model,
        ...known,
        heard: true,
        // 3. Gone from the list: nothing left to ask about.
        asking:
          model.asking !== null &&
          known.machines?.some(({ id }) => id === model.asking) === true
            ? model.asking
            : null,
      };
      return { model: { ...next, drawn: next.drawn || readAll(next) } };
    },
    KeptRead: ({ key, kept }, { model }) => {
      const next = { ...model, kept: { ...model.kept, [key]: kept } };
      return { model: { ...next, drawn: next.drawn || readAll(next) } };
    },
    // 2. Ask
    Ask: ({ id }, { model }) =>
      model.forgetting !== null && model.forgetting.problem === null
        ? {}
        : {
            model: { ...model, asking: id },
            ...(model.forgetting === null ? {} : { command: keepForgetting() }),
          },
    Keep: (_, { model }) =>
      model.forgetting !== null && model.forgetting.problem === null
        ? {}
        : {
            model: { ...model, asking: null },
            ...(model.forgetting === null ? {} : { command: keepForgetting() }),
          },
    // 3. Forget
    Forget: (_, { model }) =>
      model.asking === null ? {} : { command: ask({ forget: model.asking }) },
    Reload: () => ({ command: ask({ forget: null }) }),
  },
});
