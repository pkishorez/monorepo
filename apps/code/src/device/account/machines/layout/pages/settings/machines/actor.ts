import { Effect, Layer, Schema, Stream } from 'effect';
import { Actor } from '@kestack/kabuki';
import {
  HarnessAccountInfo,
  Machine,
  SpeechToTextState,
} from '@kestack/connect/code';
import { type Setup, Machines } from '../../../../machines.ts';
import { MachineCards } from './store.ts';
import { MachineCard } from './machine/index.ts';
import { ask, keepForgetting } from './commands.ts';

/*
 * Settings → Machines: the signed-in Account's Machines as the Machine
 * List holds them, so the list never waits for a Machine, each standing as
 * the sidebar says it, by its Line and Last Seen; and each Machine's own
 * settings, as its Machine's setup holds them: kept on this device, and asked
 * of the Machine behind, each on its own.
 *
 * 1. Read    what `Machines` holds, followed, the list and each setup;
 *            nothing is drawn until the list kept here and every listed
 *            Machine's setup has been read, so the page draws once. Then
 *            one card per Machine (`machine/`), told whose Machine it is
 *            and handed it and what its setup holds, and none while no
 *            Account is known. Reload asks the Machine List and every
 *            setup again, as the sidebar's does.
 * 2. Ask     Forget, asked by a card (`MachineCards`), asks first, saying
 *            when the Machine was last seen and how its tunnel stands.
 * 3. Forget  confirmed, the Machine List forgets it: Cloud Connect first,
 *            then its records on this device. Once it is gone from the
 *            list the question closes; refused, it says why.
 */

const Forgetting = Schema.NullOr(
  Schema.Struct({ id: Schema.String, problem: Schema.NullOr(Schema.String) }),
);

/** What it shows of a Machine's setup, once read. */
const SetupShown = Schema.Struct({
  accounts: Schema.NullOr(Schema.Array(HarnessAccountInfo)),
  speech: Schema.NullOr(SpeechToTextState),
  /** Why its Machine could not be asked. */
  problem: Schema.NullOr(Schema.String),
});

/** What it follows of `Machines`. */
const Known = Schema.Struct({
  accountId: Schema.NullOr(Schema.String),
  machines: Schema.NullOr(Schema.Array(Machine)),
  savedRead: Schema.Boolean,
  fetchedAt: Schema.NullOr(Schema.Number),
  forgetting: Forgetting,
  /** Each Machine's setup, by id, once read. */
  setups: Schema.Record(Schema.String, SetupShown),
});
const sameKnown = Schema.toEquivalence(Known);

/** Each setup read, as it shows here. */
const shownOf = (setups: Readonly<Record<string, Setup>>) =>
  Object.fromEntries(
    Object.entries(setups)
      .filter(([, setup]) => setup.savedRead)
      .map(([id, { accounts, speech, problem }]) => [
        id,
        { accounts, speech, problem },
      ]),
  );

const Model = Schema.Struct({
  /** Whether `Machines` has said anything yet. */
  heard: Schema.Boolean,
  accountId: Schema.NullOr(Schema.String),
  machines: Schema.NullOr(Schema.Array(Machine)),
  savedRead: Schema.Boolean,
  fetchedAt: Schema.NullOr(Schema.Number),
  forgetting: Forgetting,
  setups: Known.fields.setups,
  /** Whether the page has been drawn: from then on it never waits again. */
  drawn: Schema.Boolean,
  /** The Machine Forget is asking about. */
  asking: Schema.NullOr(Schema.String),
});
type Model = typeof Model.Type;

export const MachineSettings = Actor.define('MachineSettings', {
  requires: [Machines],
  model: Model,
  message: Schema.TaggedUnion({
    Known: Known.fields,
    Ask: { id: Schema.String },
    Keep: {},
    Forget: {},
    Reload: {},
  }),
});

/**
 * A card's key: its Account's id and its Machine's, which no id holds a
 * space of, so a card is never told an Account it is not of.
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

/** A key's Machine's setup, once read. */
const setupOf = (model: Model, key: string) =>
  model.setups[whoseOf(key).machineId];

/** Each listed Machine's key whose setup has been read. */
const readKeysOf = (model: Model) =>
  keysOf(model).filter((key) => setupOf(model, key) !== undefined);

/**
 * Whether what this device kept has been read: the list, unless Cloud
 * Connect's came first, and each listed Machine's setup.
 */
const readAll = (model: Model) =>
  (model.savedRead || model.machines !== null) &&
  keysOf(model).every((key) => setupOf(model, key) !== undefined);

export const MachineSettingsLive = Actor.build(MachineSettings, {
  init: () => ({
    model: {
      heard: false,
      accountId: null,
      machines: null,
      savedRead: false,
      fetchedAt: null,
      forgetting: null,
      setups: {},
      drawn: false,
      asking: null,
    },
  }),
  children: {
    cards: {
      actor: MachineCard.actor,
      each: ({ model }) => readKeysOf(model),
      input: (_, key) => ({ machineId: whoseOf(key).machineId }),
      props: ({ model }, key) => {
        const { machineId } = whoseOf(key);
        const setup = setupOf(model, key);
        return {
          // A key is read only of a listed Machine.
          machine: model.machines!.find(({ id }) => id === machineId)!,
          accounts: setup?.accounts ?? null,
          speech: setup?.speech ?? null,
          problem: setup?.problem ?? null,
        };
      },
    },
  },
  // 2. Ask
  provides: (self) =>
    Layer.succeed(MachineCards, {
      forget: (id) => self.send({ _tag: 'Ask', id }),
    }),
  workers: {
    // 1. Read
    known: {
      run: (self) =>
        // The list, Forget and each setup read, so a line changes nothing
        // here.
        Effect.flatMap(Machines, ({ state }) =>
          state.pipe(
            Stream.map(
              ({
                accountId,
                machines,
                savedRead,
                fetchedAt,
                forgetting,
                setups,
              }) => ({
                accountId,
                machines,
                savedRead,
                fetchedAt,
                forgetting,
                setups: shownOf(setups),
              }),
            ),
            Stream.changesWith(sameKnown),
            Stream.runForEach((known) =>
              self.send({ _tag: 'Known', ...known }),
            ),
          ),
        ),
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
