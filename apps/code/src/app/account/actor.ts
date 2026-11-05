import { Effect, Layer, Queue, Schema, Stream } from 'effect';
import { Accounts, type AccountsState } from '@kestack/auth-toolkit/client';
import {
  CloudClient,
  Connection,
  PluginMismatch,
} from '@kestack/connect/cloud';
import { Actor, Command } from '@kestack/kabuki';
import { Page, Router } from '@kestack/kabuki/routing';
import { OnOutdated } from '@kestack/std-toolkit/replica';
import { home, type Page as Place } from '../app.ts';
import {
  Copy,
  copying,
  keptAccounts,
  nothing,
  Preferences,
  Storage,
} from '../storage/index.ts';
import {
  behindAll,
  Connection as ConnectionActor,
  moves,
  reach,
  toNewest,
} from './connection/index.ts';
import {
  Connections,
  connectionsOf,
  type Known,
  nobody,
  Said,
  saidOf,
} from './account.ts';
import {
  dropForgotten,
  forget,
  keepList,
  list,
  ListShelf,
  pruneUnlisted,
} from './commands.ts';
import { Frame } from './frame/index.ts';
import { voice } from './frame/header/voice/index.ts';
import { Home } from './pages/home/index.ts';
import { Project } from './pages/project/index.ts';
import { Settings } from './pages/settings/index.ts';

/*
 * The Account: its page, `/a/:accountId`, made anew for each Account a URL
 * names, and all of the app under it: its Connections, the frame drawn
 * around its pages, and its pages. A tab acts only as the Account active,
 * browser-wide, so the app is drawn for the page's Account only while it
 * is the one active; else the page says why, and how to get there.
 *
 * 1. Who      as auth-toolkit's `Accounts` says, and while the Auth Worker
 *             is still asked, as this device kept it: `Active`, the page's
 *             Account is the one active; else `Away`, saying why: it is
 *             signed out, here or elsewhere; another tab or app switched
 *             while it was `Active`, or added one; the link is for an
 *             Account signed in here, another active; or for one not
 *             signed in on this browser. `Away` draws one screen: signing
 *             in, and the Accounts signed in here to switch to. The page
 *             never moves by itself, but for what the user asked in this
 *             tab: a switch made from the header's Account Switcher goes
 *             to the new Account's home, and so does choosing another
 *             Account on the screen; choosing the page's own makes it
 *             `Active` in place. Signing in comes back to the page. `/`
 *             and an old address, which the root page placed under its
 *             guess, it corrects (`../actor.ts`).
 * 2. Kept     while `Active`: the Connection List kept for the Account
 *             shows first, so the app opens on its Connections even while
 *             Connect Cloud is out of reach; once read, kept or not, it
 *             says so.
 * 3. Fetch    then Connect Cloud's list, once, and again on Reload; each
 *             answer is kept for next time. The first answer prunes: every
 *             database of a Connection of the Account not on it goes, all
 *             under it with it, its Saved Drafts too, and never the
 *             Account's own; each one on it keeps only its own Instance.
 *             Later answers delete nothing, so an answer older than another
 *             tab's never deletes a Connection that tab has just listed and
 *             reads, and a list that failed deletes nothing either.
 * 4. Links    one Connection each (`connection/`), which opens its own
 *             database, sync Store and socket, and says its link: one the
 *             Connection closed with `PLUGIN_MISMATCH`, as it runs another
 *             Release of the code Plugin than this Code calls, is kept as
 *             Mismatched until one is answered; who is behind is what
 *             Connect Cloud wants it to run (`link/reach/`): the
 *             Connection, Updating, while its Link keeps relinking; or
 *             this Code, Stale, which moves to its newest build.
 * 5. Recheck  while a listed Connection's link is not up, Connect Cloud is
 *             asked again: every few seconds for the first minute, then
 *             every half a minute, until every link is up; a link that
 *             drops starts it again. A Connection whose Connection Key
 *             rotated closes a socket offering the old one with `KEY_EXPIRED`:
 *             that alone asks at once, unless an ask is already out, and the
 *             socket's next connect offers the key as listed by then. What
 *             the kept list says of each
 *             Connection's Last Seen is believed only once checked: Connect
 *             Cloud has answered, or `CHECK_FOR` passed without; until
 *             then a Connection on its way is only linking. The page back
 *             after `AWAY` or more hidden, the list is checked again, and
 *             asked at once.
 * 6. Forget   a Connection, asked from Settings: Connect Cloud forgets it,
 *             it leaves the list, so its Connection stops, and an answer
 *             asked before never brings it back; then its database goes,
 *             and no other's.
 * 7. Rename   a Connection renamed from Settings, once Connect Cloud has
 *             it: its Display Name changes in the list at once, and is kept.
 * 8. Share    `Connections`, in every State, so the pages, which Kabuki
 *             keeps whatever the State, find it: nobody's until `Active`,
 *             so what asks of it waits. Through it, each Connection's
 *             socket and records, borrowed from the Connection that owns
 *             them while it runs (`reach`), and the Moves on their way to
 *             them; and the Dictation's asks (`voice`). No socket is open
 *             outside `Active`: each is its Connection's own.
 * 9. Frame    while `Active`, once its keyboard is read from Preferences,
 *             so it draws at once (`frame/`).
 * 10. Pages   home, Settings, and a project of one Connection and its
 *             sessions (`pages/`), drawn inside the frame while `Active`.
 */

/** How long a kept list's Last Seen waits for Connect Cloud's before it is believed anyway. */
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

/** How long to wait before asking Connect Cloud again, while a link is not up. */
export const RECHECK = { fast: 3_000, slow: 30_000, fastFor: 20 } as const;

const Link = Schema.Literals(['linking', 'linked', 'relinking']);

// 1. Who
/** An Account, by its id and email. */
const Shown = Schema.Struct({ id: Schema.String, email: Schema.String });
type Shown = typeof Shown.Type;

/** Who is signed in on this browser, as the page last heard it. */
export const Who = Schema.Struct({
  /** Whether the Auth Worker has answered; until then, what this device kept. */
  answered: Schema.Boolean,
  active: Schema.NullOr(Shown),
  /** Every Account signed in here. */
  accounts: Schema.Array(Shown),
  /** The Account a switch made in this tab is making active. */
  switchingTo: Schema.NullOr(Schema.String),
});
export type Who = typeof Who.Type;

/** auth-toolkit's state as the page hears it; while checked, with the Accounts this device kept. */
export const whoOf = (now: AccountsState, kept: ReadonlyArray<Shown>): Who => {
  const plain = ({ id, email }: Shown) => ({ id, email });
  if (now._tag === 'SignedIn')
    return {
      answered: true,
      active: plain(now.active),
      accounts: now.accounts.map(plain),
      switchingTo: now.switchingTo?.id ?? null,
    };
  if (now._tag === 'SignedOut')
    return { answered: true, active: null, accounts: [], switchingTo: null };
  const last = now.last === undefined ? null : plain(now.last);
  return {
    answered: false,
    active: last,
    accounts:
      last === null || kept.some(({ id }) => id === last.id)
        ? kept.map(plain)
        : [last, ...kept.map(plain)],
    switchingTo: null,
  };
};

/** Why the page's Account is not drawn (`sign-in/away.tsx`). */
const Why = Schema.TaggedUnion({
  NotHere: {},
  SignedOut: { email: Schema.String },
  Switched: { email: Schema.String, active: Schema.String },
  Other: { email: Schema.String, active: Schema.String },
});
type Why = typeof Why.Type;

const State = Schema.TaggedUnion({
  /** It is not the Account active: why, and the sign-in screen. */
  Away: { why: Why },
  Active: { email: Schema.String },
});
type State = typeof State.Type;

/** The page's Account's email, as `state` last knew it; null for none. */
const emailOf = (state: State): string | null =>
  state._tag === 'Active'
    ? state.email
    : state.why._tag === 'NotHere'
      ? null
      : state.why.email;

/**
 * Where the page stands as `who` is heard, after `before`: `Active` as the
 * Account active; else `Away`, why as it was before: `Switched` once it
 * was `Active`, `SignedOut` once it was known here and is no longer.
 */
export const standOf = (accountId: string, who: Who, before: State): State => {
  const { active } = who;
  if (active?.id === accountId) return { _tag: 'Active', email: active.email };
  const mine = who.accounts.find(({ id }) => id === accountId) ?? null;
  if (mine !== null && active !== null) {
    const was =
      before._tag === 'Active' ||
      (before._tag === 'Away' && before.why._tag === 'Switched');
    return {
      _tag: 'Away',
      why: {
        _tag: was ? 'Switched' : 'Other',
        email: mine.email,
        active: active.email,
      },
    };
  }
  const email = mine?.email ?? emailOf(before);
  return {
    _tag: 'Away',
    why: email === null ? { _tag: 'NotHere' } : { _tag: 'SignedOut', email },
  };
};

const Model = Schema.Struct({
  /** Who is signed in here, as last heard; null until heard. */
  who: Schema.NullOr(Who),
  /**
   * The Account the page leaves for the home of, once it is active, the
   * mark drawn meanwhile: the one a switch from the header makes active,
   * or another chosen on the sign-in screen.
   */
  leaving: Schema.NullOr(Schema.String),
  /** Why signing in, or a switch, asked here failed, until one is asked again. */
  problem: Schema.NullOr(Schema.String),
  /** Whether a sign-in asked here is under way: the page leaving for Google. */
  signingIn: Schema.Boolean,
  /** The frame's keyboard, from Preferences; null until read. */
  keyboard: Schema.NullOr(Frame.Keys),
  /** The list: kept on this device, or as Connect Cloud said it. */
  list: Copy(Schema.Array(Connection.schema)),
  fetchedAt: Schema.NullOr(Schema.Number),
  /** Whether the list's Last Seen is believed: Connect Cloud answered, or `CHECK_FOR` passed. */
  checked: Schema.Boolean,
  forgetting: Schema.NullOr(
    Schema.Struct({
      id: Schema.String,
      problem: Schema.NullOr(Schema.String),
    }),
  ),
  /** Each listed Connection's link, by id. */
  links: Schema.Record(Schema.String, Link),
  /** Each listed Connection that closed its socket running another Release of the code Plugin, by id, until a socket to it is answered. */
  mismatched: Schema.Record(Schema.String, PluginMismatch.schema),
  /** How many times Connect Cloud was asked again since every link was last up. */
  rechecks: Schema.Finite,
  /** What each Connection said of itself, by id. */
  said: Schema.Record(Schema.String, Said),
});
type Model = typeof Model.Type;

/** What the page holds of the Account's Connections before it is first `Active`, and as it is again. */
const fresh = {
  list: copying.empty,
  fetchedAt: null,
  checked: false,
  forgetting: null,
  links: {},
  mismatched: {},
  rechecks: 0,
  said: {},
} satisfies Partial<Model>;

export const Account = Page.define({
  path: '/a/:accountId',
  params: { accountId: Schema.String },
  requires: [Accounts, CloudClient, Storage, Preferences, OnOutdated],
  pages: { Home: Home.page, Settings: Settings.page, Project: Project.page },
  model: Model,
  state: State,
  message: Schema.TaggedUnion({
    // 1. Who
    Heard: { who: Who },
    /** An Account signed in here, chosen on the sign-in screen. */
    ChooseAsked: { id: Schema.String },
    SignInAsked: {},
    /** A sign-in asked here ended without leaving the page, as under the Fake. */
    SignInEnded: {},
    /** Signing in, or a switch, asked here failed. */
    Refused: { problem: Schema.String },
    // 9. Frame
    KeyboardRead: { keyboard: Frame.Keys },
    // 2. Kept, 3. Fetch, 5. Recheck
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
    // 4. Links
    Said: { connectionId: Schema.String, said: Said },
    // 6. Forget
    ForgetAsked: { id: Schema.String },
    Forgot: { id: Schema.String },
    ForgetFailed: { id: Schema.String, problem: Schema.String },
    ForgetDismissed: {},
    // 7. Rename
    Renamed: { id: Schema.String, displayName: Schema.NullOr(Schema.String) },
  }),
});

const idsOf = (model: Model) => (model.list.value ?? []).map(({ id }) => id);

/** Whether Connect Cloud is being asked. */
export const fetching = (model: Model) => copying.asking(model.list).length > 0;

/** Whether a listed Connection's link is not up, so Connect Cloud is asked again. */
export const anyDown = (model: Model) =>
  idsOf(model).some((id) => model.links[id] !== 'linked');

/** Whether `after` finds this Code Stale on a Connection `before` did not: it moves to its newest build. */
const newlyStale = (before: Model, after: Model) => {
  const was = behindAll(before.list.value, before.mismatched);
  return Object.entries(behindAll(after.list.value, after.mismatched)).some(
    ([id, behind]) => behind === 'Stale' && was[id] !== 'Stale',
  );
};

const delayOf = (rechecks: number) =>
  rechecks < RECHECK.fastFor ? RECHECK.fast : RECHECK.slow;

/** 8. Share: what is known of the Account's Connections, nobody's until it is `Active`. */
export const knownOf = ({
  model,
  state,
  props,
}: {
  readonly model: Model;
  readonly state: State;
  readonly props: { readonly params: { readonly accountId: string } };
}): Known =>
  state._tag !== 'Active'
    ? nobody
    : {
        accountId: props.params.accountId,
        connections: model.list.value,
        savedRead: model.list.keptRead,
        fetchedAt: model.fetchedAt,
        checked: model.checked,
        problem: model.list.problem,
        forgetting: model.forgetting,
        links: model.links,
        ...saidOf(model.said, idsOf(model)),
      };

/** The Draft open at `page`, a new session's or a Session's, if any. */
const draftAt = (page: Place | undefined) =>
  page?._tag === 'Project'
    ? {
        connectionId: page.connectionId,
        projectId: page.projectId,
        sessionId: page.page?.sessionId ?? null,
      }
    : null;

/** 1. Who: makes an Account signed in here the one active, browser-wide. */
const switchTo = Command.make('SwitchToAccount', {
  args: Schema.Struct({ id: Schema.String }),
  run: ({ id }) =>
    Effect.flatMap(Accounts, (accounts) => accounts.switchTo(id)).pipe(
      Effect.andThen(Effect.void),
      Effect.catch((error) =>
        Effect.succeed({ _tag: 'Refused' as const, problem: error.message }),
      ),
    ),
});

/**
 * 1. Who: signs one more Account in, with Google at once, coming back to
 * this page; under the dev Fake, it asks for an email.
 */
const signIn = Command.make('SignInHere', {
  run: () =>
    Effect.flatMap(Accounts, (accounts) =>
      accounts.signIn({ provider: 'google', returnTo: window.location.href }),
    ).pipe(
      Effect.as({ _tag: 'SignInEnded' as const }),
      Effect.catch((error) =>
        Effect.succeed({ _tag: 'Refused' as const, problem: error.message }),
      ),
    ),
});

/**
 * The Account's page, reaching each Connection, its socket and its
 * records, through `to`: `reach`, or a test's stand-in.
 */
export const accountWith = (to: typeof reach) =>
  Account.build({
    init: () => ({
      model: {
        who: null,
        leaving: null,
        problem: null,
        signingIn: false,
        keyboard: null,
        ...fresh,
      },
      state: { _tag: 'Away', why: { _tag: 'NotHere' } },
    }),
    pages: {
      Home: Home.actor,
      Settings: Settings.actor,
      Project: Project.actor,
    },
    // 8. Share
    provides: (self) =>
      Layer.mergeAll(moves.pipe(Layer.provideMerge(to)), voice).pipe(
        Layer.provideMerge(
          Layer.effect(
            Connections,
            connectionsOf({
              known: Stream.map(self.changes, knownOf),
              current: Effect.map(self.get, knownOf),
              send: self.send,
            }),
          ),
        ),
      ),
    workers: {
      // 1. Who
      accounts: {
        run: (self) =>
          Effect.flatMap(Accounts, ({ state }) =>
            state.pipe(
              Stream.mapEffect((now) =>
                now._tag === 'Checking'
                  ? Effect.map(keptAccounts, (kept) => whoOf(now, kept))
                  : Effect.succeed(whoOf(now, [])),
              ),
              Stream.runForEach((who) => self.send({ _tag: 'Heard', who })),
            ),
          ),
      },
      // 9. Frame
      keyboard: {
        run: (self) =>
          Stream.runForEach(Frame.keyboard, (keyboard) =>
            self.send({ _tag: 'KeyboardRead', keyboard }),
          ),
      },
    },
    states: {
      Active: {
        workers: {
          // 2. Kept
          kept: {
            while: ({ model }) => !model.list.keptRead,
            run: (self) =>
              Effect.gen(function* () {
                const { props } = yield* self.get;
                const connections = yield* (yield* Storage).cache.read(
                  ListShelf,
                  {
                    accountId: props.params.accountId,
                    connectionId: null,
                    projectId: null,
                  },
                );
                yield* self.send({ _tag: 'KeptRead', connections });
              }),
          },
          // 3. Fetch
          fetch: {
            each: ({ model }) => copying.asking(model.list),
            run: (self, since) =>
              Effect.flatMap(list(Number(since)), self.send),
          },
          // 5. Recheck
          recheck: {
            while: ({ model }) => !fetching(model) && anyDown(model),
            run: (self) =>
              Effect.flatMap(self.get, ({ model }) =>
                Effect.sleep(delayOf(model.rechecks)).pipe(
                  Effect.andThen(self.send({ _tag: 'RecheckDue' })),
                ),
              ),
          },
          // 5. Recheck: back after a while away, the list is checked again.
          back: {
            run: (self) =>
              Stream.runForEach(back, () => self.send({ _tag: 'Back' })),
          },
          // 5. Recheck: the kept list believed anyway, once Connect Cloud
          // has been waited on for long enough.
          check: {
            while: ({ model }) => !model.checked,
            run: (self) =>
              Effect.sleep(CHECK_FOR).pipe(
                Effect.andThen(self.send({ _tag: 'CheckWaited' })),
              ),
          },
        },
        children: {
          // 4. Links: each listed Connection.
          connection: Actor.child(ConnectionActor.actor, {
            each: ({ model }) => idsOf(model),
            input: ({ props }, connectionId) => ({
              accountId: props.params.accountId,
              connectionId,
            }),
          }),
          // 9. Frame
          frame: Actor.child(Frame.actor, {
            while: ({ model }) => model.keyboard !== null,
            input: ({ model }) => ({
              keyboard: model.keyboard ?? Frame.keysOf(nothing),
            }),
            props: ({ state, props }) => ({
              accountId: props.params.accountId,
              email: state.email,
              place: draftAt(props.route.page),
            }),
          }),
        },
      },
    },
    on: {
      // 1. Who: the list starts afresh each time the page is `Active`. A
      // switch from the header, while `Active`, leaves for the new
      // Account's home; so does one to another chosen here, once it is
      // active.
      Heard: ({ who }, { model, state, props }) => {
        const now = standOf(props.params.accountId, who, state);
        const anew = state._tag !== 'Active' && now._tag === 'Active';
        const wanted = now._tag === 'Active' ? who.switchingTo : model.leaving;
        // A switch seen under way that ended on another Account leaves
        // nothing wanted, so a later switch elsewhere never moves this tab.
        const ended =
          model.who !== null &&
          model.who.switchingTo !== null &&
          who.switchingTo === null &&
          who.active?.id !== wanted;
        const leaving = ended ? null : wanted;
        const arrived =
          leaving !== null &&
          who.active?.id === leaving &&
          model.who?.active?.id !== leaving;
        return {
          model: { ...model, ...(anew ? fresh : {}), who, leaving },
          state: now,
          ...(arrived ? { command: Router.replace(home(leaving)) } : {}),
        };
      },
      ChooseAsked: ({ id }, { model, props }) => {
        const { who } = model;
        if (who === null || !who.answered || who.switchingTo !== null)
          return {};
        const own = id === props.params.accountId;
        if (who.active?.id === id)
          return own
            ? {}
            : {
                model: { ...model, leaving: id },
                command: Router.replace(home(id)),
              };
        return {
          model: { ...model, leaving: own ? null : id, problem: null },
          command: switchTo({ id }),
        };
      },
      SignInAsked: (_, { model }) =>
        model.signingIn
          ? {}
          : {
              model: { ...model, problem: null, signingIn: true },
              command: signIn(),
            },
      SignInEnded: (_, { model }) => ({
        model: { ...model, signingIn: false },
      }),
      Refused: ({ problem }, { model }) => ({
        model: { ...model, leaving: null, signingIn: false, problem },
      }),
      KeyboardRead: ({ keyboard }, { model }) => ({
        model: { ...model, keyboard },
      }),
      KeptRead: ({ connections }, { model }) => ({
        model: { ...model, list: copying.read(model.list, connections) },
      }),
      // An answer asked before a later ask, or a Forget, is dropped.
      Fetched: ({ since, connections, at }, { model, props }) => {
        if (!copying.latest(model.list, since)) return {};
        const { accountId } = props.params;
        const next = {
          ...model,
          list: copying.answered(model.list, since, connections),
          fetchedAt: at,
          checked: true,
        };
        return {
          model: next,
          command: [
            keepList({ accountId, connections }),
            // 4. Links: Connect Cloud now wants another Release than this
            // Code calls, of a Connection that refused it.
            ...(newlyStale(model, next) ? [toNewest({})] : []),
            ...(model.fetchedAt === null
              ? [
                  pruneUnlisted({
                    accountId,
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
      // 4. Links: what a Connection says, its link and its mismatch with it,
      // kept until a socket is answered; this Code found Stale moves to its
      // newest build.
      Said: ({ connectionId, said }, { model }) => {
        const { [connectionId]: _was, ...rest } = model.mismatched;
        const next = {
          ...model,
          said: { ...model.said, [connectionId]: said },
          links: { ...model.links, [connectionId]: said.link },
          mismatched:
            said.mismatch === null
              ? rest
              : { ...rest, [connectionId]: said.mismatch },
        };
        const up = anyDown(next) ? next : { ...next, rechecks: 0 };
        // 5. Recheck: a Connection whose key just expired asks at once. An
        // ask already out may answer with the old key, and the socket closing
        // again says nothing new, so the rechecks go back to their fast pace.
        const expired =
          said.expired && model.said[connectionId]?.expired !== true;
        const rechecked = expired ? { ...up, rechecks: 0 } : up;
        return {
          model:
            expired && !fetching(rechecked)
              ? { ...rechecked, list: copying.ask(rechecked.list) }
              : rechecked,
          ...(newlyStale(model, up) ? { command: toNewest({}) } : {}),
        };
      },
      // 6. Forget
      ForgetAsked: ({ id }, { model }) =>
        model.forgetting !== null && model.forgetting.problem === null
          ? {}
          : {
              model: { ...model, forgetting: { id, problem: null } },
              command: forget({ id }),
            },
      // Out of the list first, so its Connection stops and no Query reads its
      // Instance as it goes.
      Forgot: ({ id }, { model, props }) => {
        const { accountId } = props.params;
        const connections = (model.list.value ?? []).filter(
          (each) => each.id !== id,
        );
        const { [id]: _said, ...said } = model.said;
        return {
          model: {
            ...model,
            list: copying.changed(model.list, connections),
            forgetting: null,
            said,
          },
          command: [
            keepList({ accountId, connections }),
            dropForgotten({ accountId, id }),
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
      // 7. Rename
      Renamed: ({ id, displayName }, { model, props }) => {
        const connections = (model.list.value ?? []).map((each) =>
          each.id === id ? { ...each, displayName } : each,
        );
        return {
          model: { ...model, list: copying.changed(model.list, connections) },
          command: keepList({ accountId: props.params.accountId, connections }),
        };
      },
    },
  });

export const AccountLive = accountWith(reach);
