import { Effect, Queue, Stream } from 'effect';
import { Address, History, Snapshot } from '@kestack/kabuki';
import type { Runtime } from '@kestack/kabuki';
import type { AnyActor } from '@kestack/kabuki/types';
import type { AppRuntime } from '@kestack/kabuki/react/types';
import {
  InstanceNotFound,
  KabukiSessionApi,
  PathNotFound,
  StepNotFound,
} from '../../api/index.ts';
import type * as Api from '../../api/index.ts';
import { treeOf } from './read/blueprint.ts';
import { blueprintAt, encodeInstance } from './read/encode.ts';
import { readPath, summarize } from './read/path.ts';
import { instancesOf, marksAt } from './read/step.ts';
import {
  changeAt,
  changesAt,
  entryOf,
  graphAt,
  nodeOf,
  trailOf,
  workersAt,
} from './views.ts';

/*
 * Answers: the Kabuki Session Api, answered from one app as Kabuki hands it
 * to an Attachment. The app has one Runtime, the same through every Seek
 * and Fork, and keeps its History beside it; a call made before the app
 * has its Runtime waits for it. Kabuki is read only through its public
 * surface: the root's Blueprint, the app's History and its Branches, the
 * Snapshot after any entry, the Runtime's Workers and Addresses. The tab
 * does the work.
 *
 * 1. Step    which Step a call means: absent, the Head; `'start'`, the
 *            History's start; or an entry still kept, else StepNotFound
 *            saying which are. Which Branch: the Head's, or the one
 *            through an entry.
 * 2. Read    who it is, a Branch of its History and where it splits, the
 *            Snapshot, a Step's changes, the graph and a card, each at a
 *            Step; the Blueprint, every Actor the root can grow; and one
 *            Instance's Trail along a Branch.
 * 3. Watch   where the app is, now and after every change it reports;
 *            and the page it runs in, each time it moves to another.
 * 4. Move    Seek a Step in the app, or its Head again; Fork it to an
 *            entry.
 */

/** What the Kabuki Session knows of itself besides the app. */
export interface About {
  /** The page the app runs in, now. */
  readonly url: () => string;
  /** The Kabuki Session's name now. */
  readonly name: () => string;
  /** DevTools gives the final name. */
  readonly named: (name: string) => void;
}

/** The app's one Runtime, once it has it. */
const runtimeOf = (app: AppRuntime): Effect.Effect<Runtime> =>
  Effect.suspend(() =>
    app.runtime
      ? Effect.succeed(app.runtime)
      : Effect.callback<Runtime>((resume) => {
          const stop = app.subscribe(() => {
            if (!app.runtime) return;
            stop();
            resume(Effect.succeed(app.runtime));
          });
          return Effect.sync(stop);
        }),
  );

/** The app once it runs: its Runtime, its root Actor, and its History as it is now. */
const running = (app: AppRuntime) =>
  Effect.map(runtimeOf(app), (runtime) => ({
    runtime,
    actor: runtime.actor,
    history: app.history,
  }));

/** What an Instance's Workers are doing, as the Runtime says: known only of the Head of a running app. */
const statusesOf = (runtime: Runtime, at: Api.Step | undefined) =>
  at === undefined && runtime.running
    ? (address: string) => runtime.at(address as Address)?.workers ?? []
    : undefined;

// 1. Step
const stepNotFound = (history: History, step: Api.Step) => {
  const line = History.entries(history);
  return new StepNotFound({
    step,
    oldest: line[0]?.id ?? null,
    newest: line.at(-1)?.id ?? null,
  });
};

/** The entry a Step is right after, `null` for the History's start. */
const resolve = (
  history: History,
  at: Api.Step | undefined,
): Effect.Effect<
  { readonly id: number | null; readonly step: Api.Step },
  StepNotFound
> => {
  if (at === undefined) {
    const { head } = history;
    return Effect.succeed({ id: head, step: head ?? 'start' });
  }
  if (at === 'start') return Effect.succeed({ id: null, step: at });
  return History.entry(history, at)
    ? Effect.succeed({ id: at, step: at })
    : Effect.fail(stepNotFound(history, at));
};

/**
 * The last entry of the Branch through an entry: the Head, if its Branch
 * passes through it, else the newest tip that does; `null` for the Head's.
 */
const tipOf = (
  history: History,
  branch: number | undefined,
): Effect.Effect<number | null, StepNotFound> => {
  if (branch === undefined) return Effect.succeed(history.head);
  if (!History.entry(history, branch))
    return Effect.fail(stepNotFound(history, branch));
  const through = (tip: number | null) =>
    tip !== null &&
    History.entries(history, tip).some((entry) => entry.id === branch);
  if (through(history.head)) return Effect.succeed(history.head);
  const tips = History.tips(history).map((entry) => entry.id);
  return Effect.succeed(tips.reverse().find(through) ?? branch);
};

/** Where a Branch goes on in more than one way: each Step on it, the History's start too, that something off it follows. */
const splitsOf = (
  actor: AnyActor,
  history: History,
  line: ReadonlyArray<{ readonly id: number }>,
): ReadonlyArray<Api.Split> =>
  [null, ...line.map((entry) => entry.id)].flatMap((id, index) => {
    const next = History.children(history, id);
    const on = line[index]?.id;
    return next.some((entry) => entry.id !== on)
      ? [
          {
            at: id ?? ('start' as const),
            next: next.map((entry) => entryOf(actor, history, entry)),
          },
        ]
      : [];
  });

/** Work on a Step that may no longer replay: Compacted away, say. */
const played = <A>(history: History, step: Api.Step, work: () => A) =>
  Effect.try({ try: work, catch: () => stepNotFound(history, step) });

const failureOf = (app: AppRuntime) => {
  const { failure } = app;
  if (!failure) return null;
  const { error } = failure;
  return `${failure.what}: ${error instanceof Error ? error.message : String(error)}`;
};

const nowOf = (
  app: AppRuntime,
  runtime: Runtime,
  revision: number,
): Api.Now => ({
  head: app.history.head,
  size: History.entries(app.history).length,
  seeking: app.seeking ? (app.seeking.entry ?? 'start') : null,
  running: runtime.running,
  failure: failureOf(app),
  revision,
});

export const answers = (app: AppRuntime, about: About) =>
  KabukiSessionApi.toLayer({
    // 2. Read
    info: () =>
      Effect.sync(() => ({
        app: app.name,
        url: about.url(),
        name: about.name(),
      })),

    named: ({ name }) => Effect.sync(() => about.named(name)),

    history: ({ last, since, branch }) =>
      Effect.gen(function* () {
        const { runtime, actor, history } = yield* running(app);
        const line = History.entries(history, yield* tipOf(history, branch));
        const after =
          since === undefined ? line : line.filter((entry) => entry.id > since);
        const narrowed =
          last === undefined
            ? after
            : after.slice(Math.max(0, after.length - last));
        const { revision: _, ...now } = nowOf(app, runtime, 0);
        return {
          ...now,
          entries: narrowed.map((entry) => entryOf(actor, history, entry)),
          splits: splitsOf(actor, history, line),
          tips: History.tips(history).map((entry) => entry.id),
        };
      }),

    snapshot: ({ at, path = '', expand = false }) =>
      Effect.gen(function* () {
        const { actor, history } = yield* running(app);
        const { id, step } = yield* resolve(history, at);
        const whole = yield* played(history, step, () =>
          encodeInstance(
            History.snapshot(actor, history, id).root,
            actor.blueprint,
            marksAt(actor, history, id),
          ),
        );
        const read = readPath(whole, path);
        if (!read.found)
          return yield* new PathNotFound({
            path,
            found: read.at,
            available: read.available,
          });
        const { value, summarized } = expand
          ? { value: read.value, summarized: false }
          : summarize(read.value);
        return { at: step, path, value, summarized };
      }),

    changes: ({ step }) =>
      Effect.gen(function* () {
        const { actor, history } = yield* running(app);
        const entry = History.entry(history, step);
        if (!entry) return yield* stepNotFound(history, step);
        const { commands, changes } = yield* played(history, step, () =>
          changesAt(actor, history, entry),
        );
        return { entry: entryOf(actor, history, entry), commands, changes };
      }),

    graph: ({ at }) =>
      Effect.gen(function* () {
        const { runtime, actor, history } = yield* running(app);
        const { id, step } = yield* resolve(history, at);
        const root = yield* played(history, step, () =>
          graphAt(actor, history, id, statusesOf(runtime, at)),
        );
        return { at: step, root };
      }),

    blueprint: () =>
      Effect.map(runtimeOf(app), ({ actor }) => ({
        root: treeOf(actor.blueprint),
      })),

    node: ({ instance, at }) =>
      Effect.gen(function* () {
        const { runtime, actor, history } = yield* running(app);
        const { id, step } = yield* resolve(history, at);
        const snapshot = yield* played(history, step, () =>
          History.snapshot(actor, history, id),
        );
        const found = Snapshot.at(snapshot, instance as Address);
        if (!found)
          return yield* new InstanceNotFound({
            instance,
            at: step,
            available: instancesOf(snapshot).map((one) => one.address),
          });
        const print = blueprintAt(actor.blueprint, found.address);
        const entry = id === null ? undefined : History.entry(history, id);
        const change = entry
          ? yield* played(history, step, () =>
              changeAt(actor, history, entry, found.address),
            )
          : undefined;
        return {
          ...nodeOf(found, print),
          ...workersAt(found, print, statusesOf(runtime, at)),
          at: step,
          ...(change ? { change } : {}),
        };
      }),

    trail: ({ instance, branch }) =>
      Effect.gen(function* () {
        const { actor, history } = yield* running(app);
        const tip = yield* tipOf(history, branch);
        const address = Address.check(actor, instance);
        if (!address) {
          const { head } = history;
          return yield* new InstanceNotFound({
            instance,
            at: head ?? 'start',
            available: instancesOf(History.snapshot(actor, history)).map(
              (one) => one.address,
            ),
          });
        }
        return trailOf(actor, history, address, tip);
      }),

    // 3. Watch
    watch: () =>
      Stream.callback<Api.Now>(
        (queue) =>
          Effect.acquireRelease(
            Effect.sync(() => {
              let revision = 0;
              // Nothing to say until the app has a Runtime.
              const tell = () => {
                if (app.runtime)
                  Queue.offerUnsafe(queue, nowOf(app, app.runtime, revision++));
              };
              tell();
              return app.subscribe(tell);
            }),
            (unsubscribe) => Effect.sync(unsubscribe),
          ),
        // A slow reader gets only the latest.
        { bufferSize: 1, strategy: 'sliding' },
      ),

    page: () =>
      Stream.callback<string>(
        (queue) =>
          Effect.acquireRelease(
            Effect.sync(() => {
              const tell = () => void Queue.offerUnsafe(queue, about.url());
              // The Router writes the URL just after the change it reports.
              const soon = () => void setTimeout(tell, 0);
              tell();
              globalThis.addEventListener?.('popstate', tell);
              const unsubscribe = app.subscribe(soon);
              return () => {
                unsubscribe();
                globalThis.removeEventListener?.('popstate', tell);
              };
            }),
            (stop) => Effect.sync(stop),
          ),
        { bufferSize: 1, strategy: 'sliding' },
      ).pipe(Stream.changes),

    // 4. Move
    seek: ({ step }) =>
      Effect.gen(function* () {
        const { history } = yield* running(app);
        if (step === null) return app.toHead();
        if (step === 'start') return app.seek(null);
        if (!History.entry(history, step))
          return yield* stepNotFound(history, step);
        app.seek(step);
      }),

    fork: ({ from }) =>
      Effect.gen(function* () {
        const { history } = yield* running(app);
        if (from !== null && !History.entry(history, from))
          return yield* stepNotFound(history, from);
        app.fork(from);
      }),
  });
