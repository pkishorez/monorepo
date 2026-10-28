import { Effect, Schema, Stream, SubscriptionRef } from 'effect';
import { CodeClients } from '@kestack/connect/code';
import { CloudClient, Connection } from '@kestack/connect/cloud';
import { Actor } from '@kestack/kabuki';
import {
  Cache,
  Copy,
  copying,
  SavedDrafts,
  Seen,
  Sync,
} from './connection/store/index.ts';
import { ConnectionsChannel, nobody } from './connections.ts';
import { Storage } from '../store/index.ts';
import { list } from './commands.ts';
import {
  dropForgotten,
  forget,
  keepList,
  ListShelf,
  pruneUnlisted,
} from './commands.ts';
import { Connection as ConnectionActor } from './connection/index.ts';
import { Voice } from './voice/index.ts';
import { Prepared } from './connections.ts';

/*
 * Connections: the Connections of one Account, a Child of the root page for as
 * long as that Account is known, keyed by its id: the Connection List, kept
 * in the `connections` table of the Account's database, a link to each
 * Connection on it, and one Connection Actor each.
 *
 * 1. Kept     the list last kept for the Account shows first, so the app
 *             opens on its Connections even while Cloud Connect is out of reach;
 *             once read, kept or not, it says so.
 * 2. Fetch    then Cloud Connect's list, once, and again on Reload; each
 *             answer is kept for next time. The first answer prunes: every
 *             database of a Connection of the Account not on it goes, all
 *             under it with it, its Saved Drafts too, and never the
 *             Account's own; each one on it keeps only its own Instance.
 *             Later answers delete nothing, so an answer older than another
 *             tab's never deletes a Connection that tab has just listed and
 *             reads, and a list that failed deletes nothing either.
 * 3. Links    one socket per listed Connection, followed, and one Connection
 *             each (connection/), which opens its own database and sync Store.
 * 4. Recheck  while a listed Connection's link is not up, Cloud Connect is asked
 *             again: every few seconds for the first minute, then every
 *             half a minute, so one on its way, whose tunnel is opening,
 *             shows up as soon as it can be reached. Once every link is up
 *             it stops; a link that drops starts it again.
 *             What the kept list says of each Connection's Last Seen is
 *             believed only once checked: Cloud Connect has answered, or
 *             `CHECK_FOR` passed without; until then a Connection on its way
 *             is only linking, so a reload never calls it down, then up.
 * 5. Forget   a Connection, asked from Settings: Cloud Connect forgets it, it
 *             leaves the list, so its Connection stops and nothing reads its
 *             Instance any more, and an answer asked before never brings
 *             it back; then its database goes, and no other's: another tab
 *             may list a Connection this one has not heard of yet.
 * 6. Share    what it holds is what `Connections` says to every Actor, and
 *             what they ask through it comes here, once the app is drawn
 *             for its Account. Until then it prepares: it reads its kept
 *             list, starts a Connection each and asks Cloud Connect, sharing
 *             nothing, and tells the root page once the kept list is read
 *             (`Prepared`), so the Account drawn before stays on screen
 *             until this one can be drawn whole.
 * 7. Voice     recording from anywhere (`voice/`): one Dictation for the
 *              Account, which hears asks only while it is drawn, so it
 *              carries on across every page and hands its text to the
 *              Draft on screen as it stops.
 *
 * What it keeps is `store.ts` and the cache (`connection/store/`); what it
 * says is `connections.ts`. Beside it, `layout/` is what the Connections of the
 * Account drawn are seen through, still a Child of the root page.
 */

/** How long a kept list's Last Seen waits for Cloud Connect's before it is believed anyway. */
export const CHECK_FOR = 10_000;

/** How long to wait before asking Cloud Connect again, while a link is not up. */
export const RECHECK = { fast: 3_000, slow: 30_000, fastFor: 20 } as const;

const Link = Schema.Literals(['linking', 'linked', 'relinking']);

const Model = Schema.Struct({
  accountId: Schema.String,
  /** The list: kept on this device, or as Cloud Connect said it. */
  list: Copy(Schema.Array(Connection.schema)),
  fetchedAt: Schema.NullOr(Schema.Number),
  /** Whether the list's Last Seen is believed: Cloud Connect answered, or `CHECK_FOR` passed. */
  checked: Schema.Boolean,
  forgetting: Schema.NullOr(
    Schema.Struct({
      id: Schema.String,
      problem: Schema.NullOr(Schema.String),
    }),
  ),
  /** Each listed Connection's link, by id. */
  links: Schema.Record(Schema.String, Link),
  /** How many times Cloud Connect was asked again since every link was last up. */
  rechecks: Schema.Finite,
});
type Model = typeof Model.Type;

export const Connections = Actor.define('Connections', {
  requires: [
    CloudClient,
    Cache,
    Seen,
    SavedDrafts,
    Sync,
    Storage,
    ConnectionsChannel,
    CodeClients,
    Prepared,
  ],
  input: Schema.Struct({ accountId: Schema.String }),
  props: Schema.Struct({
    /** The Account's email, for the command that adds a Connection. */
    email: Schema.NullOr(Schema.String),
    /** Whether the app is drawn for this Account; until it is, it prepares. */
    drawn: Schema.Boolean,
  }),
  model: Model,
  message: Schema.TaggedUnion({
    KeptRead: { connections: Schema.NullOr(Schema.Array(Connection.schema)) },
    Fetched: {
      since: Schema.Finite,
      connections: Schema.Array(Connection.schema),
      at: Schema.Number,
    },
    Failed: { since: Schema.Finite, problem: Schema.String },
    ReloadAsked: {},
    RecheckDue: {},
    CheckWaited: {},
    LinkChanged: { connectionId: Schema.String, link: Link },
    ForgetAsked: { id: Schema.String },
    Forgot: { id: Schema.String },
    ForgetFailed: { id: Schema.String, problem: Schema.String },
    ForgetDismissed: {},
  }),
});

const idsOf = (model: Model) => (model.list.value ?? []).map(({ id }) => id);

/** Whether Cloud Connect is being asked. */
export const fetching = (model: Model) => copying.asking(model.list).length > 0;

/** Whether a listed Connection's link is not up, so Cloud Connect is asked again. */
export const anyDown = (model: Model) =>
  idsOf(model).some((id) => model.links[id] !== 'linked');

const delayOf = (rechecks: number) =>
  rechecks < RECHECK.fastFor ? RECHECK.fast : RECHECK.slow;

export const ConnectionsLive = Actor.build(Connections, {
  init: ({ accountId }) => ({
    model: {
      accountId,
      list: copying.empty,
      fetchedAt: null,
      checked: false,
      forgetting: null,
      links: {},
      rechecks: 0,
    },
  }),
  workers: {
    // 1. Kept
    kept: {
      while: ({ model }) => !model.list.keptRead,
      run: (self) =>
        Effect.gen(function* () {
          const { model } = yield* self.get;
          const connections = yield* (yield* Cache).read(ListShelf, {
            accountId: model.accountId,
            connectionId: null,
            projectId: null,
          });
          yield* self.send({ _tag: 'KeptRead', connections });
        }),
    },
    // 2. Fetch
    fetch: {
      each: ({ model }) => copying.asking(model.list),
      run: (self, since) => Effect.flatMap(list(Number(since)), self.send),
    },
    // 3. Links
    links: {
      each: ({ model }) => idsOf(model),
      run: (self, connectionId) =>
        Stream.runForEach(CodeClients.link(connectionId), (link) =>
          self.send({ _tag: 'LinkChanged', connectionId, link }),
        ),
    },
    // 4. Recheck
    recheck: {
      while: ({ model }) => !fetching(model) && anyDown(model),
      run: (self) =>
        Effect.flatMap(self.get, ({ model }) =>
          Effect.sleep(delayOf(model.rechecks)).pipe(
            Effect.andThen(self.send({ _tag: 'RecheckDue' })),
          ),
        ),
    },
    // 4. Recheck: the kept list believed anyway, once Cloud Connect
    // has been waited on for long enough.
    check: {
      while: ({ model }) => !model.checked,
      run: (self) =>
        Effect.sleep(CHECK_FOR).pipe(
          Effect.andThen(self.send({ _tag: 'CheckWaited' })),
        ),
    },
    // 6. Share, once drawn.
    publish: {
      while: ({ props }) => props.drawn,
      run: (self) =>
        Effect.gen(function* () {
          const { known } = yield* ConnectionsChannel;
          const { accountId } = (yield* self.get).model;
          yield* self.changes.pipe(
            Stream.map(({ model }) => ({
              accountId: model.accountId,
              connections: model.list.value,
              savedRead: model.list.keptRead,
              fetchedAt: model.fetchedAt,
              checked: model.checked,
              problem: model.list.problem,
              forgetting: model.forgetting,
              links: model.links,
            })),
            Stream.changes,
            // Its Connections share their own beside it.
            Stream.runForEach((listed) =>
              SubscriptionRef.update(known, (now) => ({ ...now, ...listed })),
            ),
            // Signed out, or another Account drawn: nobody's Connections are
            // known, unless the next Account's already are. Its Connections
            // take out their own as they go.
            Effect.ensuring(
              SubscriptionRef.update(known, (now) =>
                now.accountId === accountId
                  ? { ...nobody, setups: now.setups, seen: now.seen }
                  : now,
              ),
            ),
          );
        }),
    },
    requests: {
      while: ({ props }) => props.drawn,
      run: (self) =>
        Effect.flatMap(ConnectionsChannel, ({ asked }) =>
          Stream.runForEach(Stream.fromQueue(asked), self.send),
        ),
    },
    // Until drawn: ready once the kept list is read.
    prepared: {
      while: ({ model, props }) => !props.drawn && model.list.keptRead,
      run: (self) =>
        Effect.flatMap(self.get, ({ model }) =>
          Effect.flatMap(Prepared, ({ ready }) => ready(model.accountId)),
        ),
    },
  },
  children: {
    // 7. Voice
    voice: {
      actor: Voice.actor,
      props: ({ props }) => ({ drawn: props.drawn }),
    },
    // 3. Links: each listed Connection.
    connection: {
      actor: ConnectionActor.actor,
      each: ({ model }) => idsOf(model),
      input: ({ model }, connectionId) => ({
        accountId: model.accountId,
        connectionId,
      }),
    },
  },
  on: {
    KeptRead: ({ connections }, { model }) => ({
      model: { ...model, list: copying.read(model.list, connections) },
    }),
    // An answer asked before a later ask, or a Forget, is dropped.
    Fetched: ({ since, connections, at }, { model }) =>
      !copying.latest(model.list, since)
        ? {}
        : {
            model: {
              ...model,
              list: copying.answered(model.list, since, connections),
              fetchedAt: at,
              checked: true,
            },
            command: [
              keepList({ accountId: model.accountId, connections }),
              ...(model.fetchedAt === null
                ? [
                    pruneUnlisted({
                      accountId: model.accountId,
                      connectionIds: connections.map(({ id }) => id),
                    }),
                  ]
                : []),
            ],
          },
    Failed: ({ since, problem }, { model }) => ({
      model: { ...model, list: copying.refused(model.list, since, problem) },
    }),
    // Reload: asked at once, and quickly again while a link is not up.
    ReloadAsked: (_, { model }) => ({
      model: { ...model, list: copying.ask(model.list), rechecks: 0 },
    }),
    CheckWaited: (_, { model }) => ({ model: { ...model, checked: true } }),
    RecheckDue: (_, { model }) => ({
      model: {
        ...model,
        list: copying.ask(model.list),
        rechecks: model.rechecks + 1,
      },
    }),
    LinkChanged: ({ connectionId, link }, { model }) => {
      const next = {
        ...model,
        links: { ...model.links, [connectionId]: link },
      };
      return { model: anyDown(next) ? next : { ...next, rechecks: 0 } };
    },
    // 5. Forget
    ForgetAsked: ({ id }, { model }) =>
      model.forgetting !== null && model.forgetting.problem === null
        ? {}
        : {
            model: { ...model, forgetting: { id, problem: null } },
            command: forget({ id }),
          },
    // Out of the list first, so its Connection stops and no Query reads its
    // Instance as it goes.
    Forgot: ({ id }, { model }) => {
      const connections = (model.list.value ?? []).filter(
        (each) => each.id !== id,
      );
      return {
        model: {
          ...model,
          list: copying.changed(model.list, connections),
          forgetting: null,
        },
        command: [
          keepList({ accountId: model.accountId, connections }),
          dropForgotten({ accountId: model.accountId, id }),
        ],
      };
    },
    ForgetFailed: ({ id, problem }, { model }) =>
      model.forgetting?.id === id
        ? { model: { ...model, forgetting: { id, problem } } }
        : {},
    ForgetDismissed: (_, { model }) => ({
      model: { ...model, forgetting: null },
    }),
  },
});
