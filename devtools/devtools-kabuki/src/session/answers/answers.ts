import { Cause, Effect, Queue, Stream } from 'effect';
import type { History } from '@kestack/kabuki';
import type { AppRuntime } from '@kestack/kabuki/react/view';
import {
  InstanceNotFound,
  KabukiSessionApi,
  PathNotFound,
  StepNotFound,
} from '../../api/index.ts';
import type * as Api from '../../api/index.ts';
import { graphAt } from './read/at.ts';
import { encodeInstance } from './read/encode.ts';
import { readPath, summarize } from './read/path.ts';
import { nodesOf, walk, workersOf } from './read/steps.ts';
import { changesAt, entryOf, graphOf, nodeOf } from './views.ts';

/*
 * Answers: the Kabuki Session Api, answered from one running app. Every
 * answer reads the app as it is when asked; the tab does the work.
 *
 * 1. Step    which Step a call means: absent, the Head; `'init'`; or an
 *            entry still kept, else StepNotFound saying which are.
 * 2. Read    who it is, its History, the Snapshot, a Step's changes, the
 *            graph and a card, each at a Step.
 * 3. Watch   where the app is, now and after every change it reports;
 *            and the page it runs in, each time it moves to another.
 * 4. Move    show a Step in the app, or go live; fork from an entry.
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

// 1. Step
const stepNotFound = (history: History, step: Api.Step) => {
  const branch = history.branch();
  return new StepNotFound({
    step,
    oldest: branch[0]?.id ?? null,
    newest: branch.at(-1)?.id ?? null,
  });
};

/** The entry a Step is right after, `null` for init. */
const resolve = (
  history: History,
  at: Api.Step | undefined,
): Effect.Effect<
  { readonly id: number | null; readonly step: Api.Step },
  StepNotFound
> => {
  if (at === undefined) {
    const head = history.head();
    return Effect.succeed({ id: head, step: head ?? 'init' });
  }
  if (at === 'init') return Effect.succeed({ id: null, step: at });
  return history.has(at)
    ? Effect.succeed({ id: at, step: at })
    : Effect.fail(stepNotFound(history, at));
};

/** Work on a Step that may no longer replay: Compacted away, say. */
const played = <A>(history: History, step: Api.Step, work: () => A) =>
  Effect.try({ try: work, catch: () => stepNotFound(history, step) });

const entryAt = (history: History, id: number) =>
  history.branch(id).find((entry) => entry.id === id);

const nowOf = (runtime: AppRuntime, revision: number): Api.Now => ({
  head: runtime.head,
  size: runtime.branch.length,
  shown: runtime.shown,
  running: runtime.running,
  failure: runtime.failure ? Cause.pretty(runtime.failure) : null,
  revision,
});

export const answers = (runtime: AppRuntime, about: About) =>
  KabukiSessionApi.toLayer({
    // 2. Read
    info: () =>
      Effect.sync(() => ({
        app: runtime.name,
        url: about.url(),
        name: about.name(),
      })),

    named: ({ name }) => Effect.sync(() => about.named(name)),

    history: ({ last, since }) =>
      Effect.sync(() => {
        const { history } = runtime;
        const branch = runtime.branch;
        const after =
          since === undefined
            ? branch
            : branch.filter((entry) => entry.id > since);
        const narrowed =
          last === undefined
            ? after
            : after.slice(Math.max(0, after.length - last));
        const { revision: _, ...now } = nowOf(runtime, 0);
        return {
          ...now,
          entries: narrowed.map((entry) => entryOf(history, entry)),
        };
      }),

    snapshot: ({ at, path = '', expand = false }) =>
      Effect.gen(function* () {
        const { history } = runtime;
        const { id, step } = yield* resolve(history, at);
        const whole = yield* played(history, step, () =>
          encodeInstance(history.snapshotAt(id), history.actor.definition),
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
        const { history } = runtime;
        const entry = history.has(step) ? entryAt(history, step) : undefined;
        if (!entry) return yield* stepNotFound(history, step);
        const { commands, changes } = yield* played(history, step, () =>
          changesAt(history, entry),
        );
        return { entry: entryOf(history, entry), commands, changes };
      }),

    graph: ({ at }) =>
      Effect.gen(function* () {
        const { history } = runtime;
        const { id, step } = yield* resolve(history, at);
        const graph = graphAt(history, id, runtime.provided);
        if (!graph) return yield* stepNotFound(history, step);
        return { at: step, root: graphOf(graph) };
      }),

    node: ({ instance, at }) =>
      Effect.gen(function* () {
        const { history } = runtime;
        const root = history.actor.definition;
        const { id, step } = yield* resolve(history, at);
        const nodes = yield* played(history, step, () =>
          nodesOf(walk(history.snapshotAt(id), root)),
        );
        const node = nodes.find((one) => one.instance.id === instance);
        if (!node)
          return yield* new InstanceNotFound({
            instance,
            at: step,
            available: nodes.map((one) => one.instance.id),
          });
        const entry = id === null ? undefined : entryAt(history, id);
        const change = entry
          ? (yield* played(history, step, () =>
              changesAt(history, entry),
            )).changes.find((one) => one.instance === instance)
          : undefined;
        const live = at === undefined;
        return {
          ...nodeOf(
            node.instance,
            node.definition,
            workersOf(node.instance, node.definition),
          ),
          at: step,
          status: live ? runtime.workers(instance) : [],
          provides: live ? runtime.provided(instance) : { top: [], state: [] },
          ...(change ? { change } : {}),
        };
      }),

    // 3. Watch
    watch: () =>
      Stream.callback<Api.Now>(
        (queue) =>
          Effect.acquireRelease(
            Effect.sync(() => {
              let revision = 0;
              Queue.offerUnsafe(queue, nowOf(runtime, revision));
              return runtime.subscribe(() => {
                Queue.offerUnsafe(queue, nowOf(runtime, ++revision));
              });
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
              // The Router writes the address just after the change it reports.
              const soon = () => void setTimeout(tell, 0);
              tell();
              globalThis.addEventListener?.('popstate', tell);
              const unsubscribe = runtime.subscribe(soon);
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
    travel: ({ step }) =>
      Effect.gen(function* () {
        if (typeof step === 'number' && !runtime.history.has(step))
          return yield* stepNotFound(runtime.history, step);
        runtime.show(step);
      }),

    fork: ({ from }) =>
      Effect.gen(function* () {
        if (from !== null && !runtime.history.has(from))
          return yield* stepNotFound(runtime.history, from);
        runtime.start(from);
        runtime.show(null);
      }),
  });
