import { Effect, Layer, Schema, Stream } from 'effect';
import { Actor } from '@kestack/kabuki';
import { HarnessAccountInfo, SpeechToTextState } from '@kestack/connect/code';
import { Connection } from '@kestack/connect/cloud';
import { type Setup, Connections } from '../../../../connections.ts';
import { ConnectionCards } from './store.ts';
import { ConnectionCard } from './connection/index.ts';
import { ask, keepForgetting } from './commands.ts';

/*
 * Settings → Connections: the signed-in Account's Connections as the Connection
 * List holds them, so the list never waits for a Connection, each standing as
 * the sidebar says it, by its Link and Last Seen; and each Connection's own
 * settings, as its Connection's setup holds them: kept on this device, and asked
 * of the Connection behind, each on its own.
 *
 * 1. Read    what `Connections` holds, followed, the list and each setup;
 *            nothing is drawn until the list kept here and every listed
 *            Connection's setup has been read, so the page draws once. Then
 *            one card per Connection (`connection/`), told whose Connection it is
 *            and handed it and what its setup holds, and none while no
 *            Account is known. Reload asks the Connection List and every
 *            setup again, as the sidebar's does.
 * 2. Ask     Forget, asked by a card (`ConnectionCards`), asks first, saying
 *            when the Connection was last seen and how its tunnel stands.
 * 3. Forget  confirmed, the Connection List forgets it: Cloud Connect first,
 *            then its records on this device. Once it is gone from the
 *            list the question closes; refused, it says why.
 */

const Forgetting = Schema.NullOr(
  Schema.Struct({ id: Schema.String, problem: Schema.NullOr(Schema.String) }),
);

/** What it shows of a Connection's setup, once read. */
const SetupShown = Schema.Struct({
  accounts: Schema.NullOr(Schema.Array(HarnessAccountInfo.schema)),
  speech: Schema.NullOr(SpeechToTextState.schema),
  /** Why its Connection could not be asked. */
  problem: Schema.NullOr(Schema.String),
});

/** What it follows of `Connections`. */
const Known = Schema.Struct({
  accountId: Schema.NullOr(Schema.String),
  connections: Schema.NullOr(Schema.Array(Connection.schema)),
  savedRead: Schema.Boolean,
  fetchedAt: Schema.NullOr(Schema.Number),
  forgetting: Forgetting,
  /** Each Connection's setup, by id, once read. */
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
  /** Whether `Connections` has said anything yet. */
  heard: Schema.Boolean,
  accountId: Schema.NullOr(Schema.String),
  connections: Schema.NullOr(Schema.Array(Connection.schema)),
  savedRead: Schema.Boolean,
  fetchedAt: Schema.NullOr(Schema.Number),
  forgetting: Forgetting,
  setups: Known.fields.setups,
  /** Whether the page has been drawn: from then on it never waits again. */
  drawn: Schema.Boolean,
  /** The Connection Forget is asking about. */
  asking: Schema.NullOr(Schema.String),
});
type Model = typeof Model.Type;

export const ConnectionSettings = Actor.define('ConnectionSettings', {
  requires: [Connections],
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
 * A card's key: its Account's id and its Connection's, which no id holds a
 * space of, so a card is never told an Account it is not of.
 */
export const keyOf = (accountId: string, connectionId: string) =>
  `${accountId} ${connectionId}`;

/** Each listed Connection's key, none while no Account is known. */
const keysOf = ({
  accountId,
  connections,
}: {
  readonly accountId: string | null;
  readonly connections: ReadonlyArray<{ readonly id: string }> | null;
}) =>
  accountId === null
    ? []
    : (connections ?? []).map(({ id }) => keyOf(accountId, id));

/** The Account and the Connection a key names. */
const whoseOf = (key: string) => {
  const at = key.indexOf(' ');
  return { accountId: key.slice(0, at), connectionId: key.slice(at + 1) };
};

/** A key's Connection's setup, once read. */
const setupOf = (model: Model, key: string) =>
  model.setups[whoseOf(key).connectionId];

/** Each listed Connection's key whose setup has been read. */
const readKeysOf = (model: Model) =>
  keysOf(model).filter((key) => setupOf(model, key) !== undefined);

/**
 * Whether what this device kept has been read: the list, unless Cloud
 * Connect's came first, and each listed Connection's setup.
 */
const readAll = (model: Model) =>
  (model.savedRead || model.connections !== null) &&
  keysOf(model).every((key) => setupOf(model, key) !== undefined);

export const ConnectionSettingsLive = Actor.build(ConnectionSettings, {
  init: () => ({
    model: {
      heard: false,
      accountId: null,
      connections: null,
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
      actor: ConnectionCard.actor,
      each: ({ model }) => readKeysOf(model),
      input: (_, key) => ({ connectionId: whoseOf(key).connectionId }),
      props: ({ model }, key) => {
        const { connectionId } = whoseOf(key);
        const setup = setupOf(model, key);
        return {
          // A key is read only of a listed Connection.
          connection: model.connections!.find(({ id }) => id === connectionId)!,
          accounts: setup?.accounts ?? null,
          speech: setup?.speech ?? null,
          problem: setup?.problem ?? null,
        };
      },
    },
  },
  // 2. Ask
  provides: (self) =>
    Layer.succeed(ConnectionCards, {
      forget: (id) => self.send({ _tag: 'Ask', id }),
    }),
  workers: {
    // 1. Read
    known: {
      run: (self) =>
        // The list, Forget and each setup read, so a link changes nothing
        // here.
        Effect.flatMap(Connections, ({ state }) =>
          state.pipe(
            Stream.map(
              ({
                accountId,
                connections,
                savedRead,
                fetchedAt,
                forgetting,
                setups,
              }) => ({
                accountId,
                connections,
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
          known.connections?.some(({ id }) => id === model.asking) === true
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
