import { Effect, Queue, Schema, Stream, SubscriptionRef } from 'effect';
import { CodeClients } from '@kestack/connect/code';
import {
  CloudClient,
  Connection,
  PluginMismatch,
} from '@kestack/connect/cloud';
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
import {
  askStanding,
  Connection as ConnectionActor,
  CodeStanding,
  toNewest,
} from './connection/index.ts';
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
 *             A socket the Connection closed with `PLUGIN_MISMATCH`, as it
 *             serves another Release of the code Plugin than this Code
 *             calls, is kept as Mismatched until one is answered. Each such
 *             close holds its Link, which waits to relink, and asks Cloud
 *             Connect afresh where this Code's Release stands
 *             (`link/reach/`); nothing kept is read for it. Latest: the
 *             Connection is Updating, and its Link relinks at once. Older:
 *             this Code is Stale, moves to its newest build, and the Link
 *             is held for good, as nothing changes until a reload.
 *             Unknown: Cloud Connect is behind, and the Link relinks after
 *             `RELINK_SLOWLY`, to be asked again. Cloud Connect out of
 *             reach decides nothing: the same slow relink. A socket that
 *             closes any other way relinks as ever, and asks nothing.
 * 4. Recheck  while a listed Connection's link is not up, Cloud Connect is asked
 *             again: every few seconds for the first minute, then every
 *             half a minute, so one on its way, whose tunnel is opening,
 *             shows up as soon as it can be reached. Once every link is up
 *             it stops; a link that drops starts it again.
 *             What the kept list says of each Connection's Last Seen is
 *             believed only once checked: Cloud Connect has answered, or
 *             `CHECK_FOR` passed without; until then a Connection on its way
 *             is only linking, so a reload never calls it down, then up.
 *             The page back after `AWAY` or more hidden, the list is as old
 *             as the time away: it is checked again, and asked at once, so
 *             coming back never calls a Connection down that is only
 *             relinking.
 * 5. Forget   a Connection, asked from Settings: Cloud Connect forgets it, it
 *             leaves the list, so its Connection stops and nothing reads its
 *             Instance any more, and an answer asked before never brings
 *             it back; then its database goes, and no other's: another tab
 *             may list a Connection this one has not heard of yet.
 * 6. Rename   a Connection renamed from Settings, once Cloud Connect has
 *             it: its Display Name changes in the list at once, and is kept,
 *             so every name of it shows the new one; an answer asked before
 *             never brings the old one back.
 * 7. Share    what it holds is what `Connections` says to every Actor, and
 *             what they ask through it comes here, once the app is drawn
 *             for its Account. Until then it prepares: it reads its kept
 *             list, starts a Connection each and asks Cloud Connect, sharing
 *             nothing, and tells the root page once the kept list is read
 *             (`Prepared`), so the Account drawn before stays on screen
 *             until this one can be drawn whole.
 * 8. Voice     recording from anywhere (`voice/`): one Dictation for the
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

/** How long the page may be hidden before what the list says is checked again. */
export const AWAY = 15_000;

/** Once each time the page shows again after `AWAY` or more hidden; never outside a browser. */
const back: Stream.Stream<void> =
  typeof document === 'undefined'
    ? Stream.never
    : Stream.callback<void>((queue) =>
        Effect.acquireRelease(
          Effect.sync(() => {
            let hiddenAt: number | null = null;
            const changed = () => {
              if (document.visibilityState === 'hidden') {
                hiddenAt = Date.now();
                return;
              }
              if (hiddenAt !== null && Date.now() - hiddenAt >= AWAY)
                Queue.offerUnsafe(queue, undefined);
              hiddenAt = null;
            };
            document.addEventListener('visibilitychange', changed);
            return () =>
              document.removeEventListener('visibilitychange', changed);
          }),
          (stop) => Effect.sync(stop),
        ),
      );

/** How long a Link waits to relink once Cloud Connect said it is behind, or could not be asked. */
export const RELINK_SLOWLY = 30_000;

/** How long to wait before asking Cloud Connect again, while a link is not up. */
export const RECHECK = { fast: 3_000, slow: 30_000, fastFor: 20 } as const;

const Link = Schema.Literals(['linking', 'linked', 'relinking']);

/** A Connection that closed a socket with a mismatch, and what Cloud Connect said of it. */
const Mismatch = Schema.Struct({
  /** The Release it said it serves; null for none. */
  running: Schema.NullOr(Schema.String),
  /** Where Cloud Connect last said this Code's Release stands; null until it answered. */
  standing: Schema.NullOr(CodeStanding),
  /** Whether Cloud Connect is being asked now. */
  asking: Schema.Boolean,
  /** Whether its Link waits to relink. */
  held: Schema.Boolean,
  /** How many times Cloud Connect was asked for it: what names each ask. */
  asks: Schema.Finite,
});
type Mismatch = typeof Mismatch.Type;

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
  /** Each listed Connection that closed its socket serving another Release of the code Plugin, by id, until a socket to it is answered. */
  mismatched: Schema.Record(Schema.String, Mismatch),
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
    /** The page shows again after a while hidden. */
    Back: {},
    LinkChanged: { connectionId: Schema.String, link: Link },
    Mismatched: {
      connectionId: Schema.String,
      mismatch: Schema.NullOr(PluginMismatch.schema),
    },
    /** Cloud Connect's answer to the ask `asks`; null when it could not be asked. */
    StandingAnswered: {
      connectionId: Schema.String,
      asks: Schema.Finite,
      standing: Schema.NullOr(CodeStanding),
    },
    /** A Link held after the ask `asks` may relink. */
    RelinkDue: { connectionId: Schema.String, asks: Schema.Finite },
    ForgetAsked: { id: Schema.String },
    Forgot: { id: Schema.String },
    ForgetFailed: { id: Schema.String, problem: Schema.String },
    ForgetDismissed: {},
    Renamed: { id: Schema.String, displayName: Schema.NullOr(Schema.String) },
  }),
});

const idsOf = (model: Model) => (model.list.value ?? []).map(({ id }) => id);

/** Whether Cloud Connect is being asked. */
export const fetching = (model: Model) => copying.asking(model.list).length > 0;

/** Whether a listed Connection's link is not up, so Cloud Connect is asked again. */
export const anyDown = (model: Model) =>
  idsOf(model).some((id) => model.links[id] !== 'linked');

/** Each Connection's ask, `<asks>:<id>`, for which `pick` holds. */
const asksWhere = (model: Model, pick: (mismatch: Mismatch) => boolean) =>
  Object.entries(model.mismatched)
    .filter(([, mismatch]) => pick(mismatch))
    .map(([id, { asks }]) => `${asks}:${id}`);

/** The ask and the Connection an `asksWhere` key names. */
const askOf = (key: string) => {
  const at = key.indexOf(':');
  return { asks: Number(key.slice(0, at)), connectionId: key.slice(at + 1) };
};

/** The Connections whose Link waits to relink. */
const heldOf = (model: Model) =>
  Object.entries(model.mismatched)
    .filter(([, { held }]) => held)
    .map(([id]) => id);

/** `model` with the mismatch of `connectionId` changed by `change`, when it is still the ask `asks`. */
const answering = (
  model: Model,
  connectionId: string,
  asks: number,
  change: (mismatch: Mismatch) => Mismatch,
): Model | null => {
  const was = model.mismatched[connectionId];
  return was === undefined || was.asks !== asks
    ? null
    : {
        ...model,
        mismatched: { ...model.mismatched, [connectionId]: change(was) },
      };
};

const delayOf = (rechecks: number) =>
  rechecks < RECHECK.fastFor ? RECHECK.fast : RECHECK.slow;

export const ConnectionsLive = Connections.build({
  init: ({ accountId }) => ({
    model: {
      accountId,
      list: copying.empty,
      fetchedAt: null,
      checked: false,
      forgetting: null,
      links: {},
      mismatched: {},
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
    // 3. Links: each one's Link, and the Release it said it runs when it
    // closed a socket with a mismatch.
    links: {
      each: ({ model }) => idsOf(model),
      run: (self, connectionId) =>
        Stream.runForEach(
          Stream.merge(
            Stream.map(
              CodeClients.link(connectionId),
              (link) => ({ _tag: 'LinkChanged', connectionId, link }) as const,
            ),
            Stream.map(
              CodeClients.mismatch(connectionId),
              (mismatch) =>
                ({ _tag: 'Mismatched', connectionId, mismatch }) as const,
            ),
          ),
          self.send,
        ),
    },
    // 3. Links: Cloud Connect asked where this Code's Release stands, for
    // each Connection that closed a socket with a mismatch.
    standing: {
      each: ({ model }) => asksWhere(model, ({ asking }) => asking),
      run: (self, key) =>
        Effect.flatMap(askStanding(), (standing) =>
          self.send({ _tag: 'StandingAnswered', ...askOf(key), standing }),
        ),
    },
    // 3. Links: a Link held after Cloud Connect was behind, or out of
    // reach, relinks a while later.
    slowly: {
      each: ({ model }) =>
        asksWhere(
          model,
          ({ asking, held, standing }) =>
            held && !asking && standing !== 'Older',
        ),
      run: (self, key) =>
        Effect.sleep(RELINK_SLOWLY).pipe(
          Effect.andThen(self.send({ _tag: 'RelinkDue', ...askOf(key) })),
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
    // 4. Recheck: back after a while away, the list is checked again.
    back: {
      run: (self) => Stream.runForEach(back, () => self.send({ _tag: 'Back' })),
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
    // 7. Share, once drawn.
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
              held: heldOf(model),
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
    // 8. Voice
    voice: Actor.child(Voice.actor, {
      props: ({ props }) => ({ drawn: props.drawn }),
    }),
    // 3. Links: each listed Connection.
    connection: Actor.child(ConnectionActor.actor, {
      each: ({ model }) => idsOf(model),
      input: ({ model }, connectionId) => ({
        accountId: model.accountId,
        connectionId,
      }),
    }),
  },
  on: {
    KeptRead: ({ connections }, { model }) => ({
      model: { ...model, list: copying.read(model.list, connections) },
    }),
    // An answer asked before a later ask, or a Forget, is dropped.
    Fetched: ({ since, connections, at }, { model }) => {
      if (!copying.latest(model.list, since)) return {};
      const next = {
        ...model,
        list: copying.answered(model.list, since, connections),
        fetchedAt: at,
        checked: true,
      };
      return {
        model: next,
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
      };
    },
    Failed: ({ since, problem }, { model }) => ({
      model: { ...model, list: copying.refused(model.list, since, problem) },
    }),
    // Reload: asked at once, and quickly again while a link is not up.
    ReloadAsked: (_, { model }) => ({
      model: { ...model, list: copying.ask(model.list), rechecks: 0 },
    }),
    CheckWaited: (_, { model }) => ({ model: { ...model, checked: true } }),
    Back: (_, { model }) => ({
      model: {
        ...model,
        checked: false,
        list: copying.ask(model.list),
        rechecks: 0,
      },
    }),
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
    // 3. Links: each mismatch holds the Link and asks Cloud Connect, kept
    // until a socket is answered; one this Code is Stale on, for good.
    Mismatched: ({ connectionId, mismatch }, { model }) => {
      const { [connectionId]: was, ...rest } = model.mismatched;
      if (was?.standing === 'Older') return {};
      if (mismatch === null) return { model: { ...model, mismatched: rest } };
      if (was?.asking === true) return {};
      return {
        model: {
          ...model,
          mismatched: {
            ...rest,
            [connectionId]: {
              running: mismatch.running,
              standing: was?.standing ?? null,
              asking: true,
              held: true,
              asks: (was?.asks ?? 0) + 1,
            },
          },
        },
      };
    },
    // 3. Links: what Cloud Connect answered decides; out of reach, it
    // decides nothing, and the Link relinks slowly.
    StandingAnswered: ({ connectionId, asks, standing }, { model }) => {
      const next = answering(model, connectionId, asks, (was) => ({
        ...was,
        standing: standing ?? was.standing,
        asking: false,
        held: standing !== 'Latest',
      }));
      if (next === null) return {};
      const stale = (each: Model) =>
        Object.values(each.mismatched).some(
          ({ standing }) => standing === 'Older',
        );
      return {
        model: next,
        ...(standing === 'Older' && !stale(model)
          ? { command: toNewest({}) }
          : {}),
      };
    },
    RelinkDue: ({ connectionId, asks }, { model }) => {
      const next = answering(model, connectionId, asks, (was) => ({
        ...was,
        held: false,
      }));
      return next === null ? {} : { model: next };
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
    // 6. Rename
    Renamed: ({ id, displayName }, { model }) => {
      const connections = (model.list.value ?? []).map((each) =>
        each.id === id ? { ...each, displayName } : each,
      );
      return {
        model: { ...model, list: copying.changed(model.list, connections) },
        command: keepList({ accountId: model.accountId, connections }),
      };
    },
  },
});
