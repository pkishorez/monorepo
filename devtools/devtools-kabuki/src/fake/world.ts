import { Effect, Layer } from 'effect';
import type { Scope } from 'effect';
import { Runtime, Snapshot } from '@kestack/kabuki';
import type { AnyActor } from '@kestack/kabuki/types';
import type { EdgesOf, ErrorOf, Fake, NeedsOf } from './fake.ts';
import { beforeStart, startFresh } from './fresh.ts';
import { indexedDb } from './saved.ts';
import type { SavedFakes } from './saved.ts';

/*
 * The Fake World: the flat list of Fakes an app picks, run in the tab. One
 * Layer gives every edge they fake; the Runtimes they run on are there for
 * the bubble and DevTools to read and Send to.
 *
 * 1. Start  each Fake from its saved Snapshot, when one is kept and still
 *           fits its Actor's code, else blank.
 * 2. Run    each Fake's Actor on a Kabuki Runtime of its own, made in the
 *           Layer's Scope and let go when it closes, then its `serve`.
 *           Every Fake's Layer merged is the world's.
 * 3. Keep   on every change, once the Fake settles, save what a reload
 *           keeps: `kept` of the Snapshot, or the whole one. Changes close
 *           together are one save; one waiting is saved at once as the page
 *           hides and as the Scope closes.
 * 4. Tell   the Fakes running now, in the order given, to whoever listens.
 */

/** How long a change waits for the next before it is saved, in milliseconds. */
export const SAVE_AFTER = 100;

/** One Fake running: the Fake, and the Runtime its Actor runs on. */
export interface RunningFake {
  readonly fake: Fake;
  readonly runtime: Runtime<AnyActor>;
}

/** How the Fake World runs. */
export interface WorldOptions {
  /** Where each Fake's Snapshot is kept across reloads: `FakeWorld.indexedDb()` in a tab. None keeps nothing. */
  readonly saved?: SavedFakes;
}

/** The Fakes an app picks, running. */
export interface World<Out = any, E = any, R = any> {
  readonly fakes: ReadonlyArray<Fake>;
  /** Every edge the Fakes fake: built, it runs them, and its Scope closed, it lets them go. Build it once. */
  readonly layer: Layer.Layer<Out, E, R>;
  /** The Fakes running now, in the order given: none until `layer` is built, and none again once its Scope closes. */
  readonly runtimes: ReadonlyArray<RunningFake>;
  /** Calls `listener` whenever a Fake starts or stops running. Returns how to stop. */
  subscribe(listener: () => void): () => void;
}

const warn = (fake: Fake, what: string, error: unknown) =>
  console.warn(`[@kestack/devtools-kabuki/fake] ${fake.name}: ${what}`, error);

// 1. Start
const startOf = (fake: Fake, saved: SavedFakes | undefined) =>
  Effect.promise(async () => {
    if (!saved) return undefined;
    try {
      const found = await saved.load(fake.name);
      return found ? Snapshot.load(fake.actor, found) : undefined;
    } catch (error) {
      warn(fake, 'its saved Snapshot is not used, it starts blank', error);
      return undefined;
    }
  });

// 3. Keep
const keeping = (
  fake: Fake,
  runtime: Runtime<AnyActor>,
  saved: SavedFakes,
): Effect.Effect<void, never, Scope.Scope> =>
  Effect.acquireRelease(
    Effect.sync(() => {
      let last = runtime.snapshot;
      let timer: ReturnType<typeof setTimeout> | undefined;
      const flush = () => {
        clearTimeout(timer);
        timer = undefined;
        const now = runtime.snapshot;
        if (now === last) return;
        last = now;
        try {
          const kept = fake.kept ? fake.kept(now) : now;
          void Promise.resolve(
            saved.save(fake.name, Snapshot.save(fake.actor, kept)),
          ).catch((error) => warn(fake, 'its Snapshot was not saved', error));
        } catch (error) {
          warn(fake, 'its Snapshot was not saved', error);
        }
      };
      const unsubscribe = runtime.subscribe(() => {
        if (runtime.snapshot !== last && timer === undefined)
          timer = setTimeout(flush, SAVE_AFTER);
      });
      const page = typeof window === 'undefined' ? undefined : window;
      page?.addEventListener('pagehide', flush);
      return () => {
        unsubscribe();
        page?.removeEventListener('pagehide', flush);
        flush();
      };
    }),
    (stop) => Effect.sync(stop),
  );

/** Run a list of Fakes: one Layer of every edge they fake, and their Runtimes. */
const make = <const Fakes extends ReadonlyArray<Fake>>(
  fakes: Fakes,
  options: WorldOptions = {},
): World<
  EdgesOf<Fakes[number]>,
  ErrorOf<Fakes[number]>,
  NeedsOf<Fakes[number]>
> => {
  // 4. Tell
  const running = new Map<number, RunningFake>();
  let runtimes: ReadonlyArray<RunningFake> = [];
  const listeners = new Set<() => void>();
  const changed = () => {
    runtimes = [...running.entries()]
      .sort(([a], [b]) => a - b)
      .map(([, one]) => one);
    listeners.forEach((listener) => listener());
  };

  // 2. Run
  const layerOf = (fake: Fake, index: number) =>
    Layer.unwrap(
      Effect.gen(function* () {
        const snapshot = yield* startOf(fake, options.saved);
        const runtime: Runtime<AnyActor> = yield* Runtime.scoped(
          fake.actor,
          (snapshot ? { snapshot } : {}) as never,
        );
        if (options.saved) yield* keeping(fake, runtime, options.saved);
        yield* Effect.acquireRelease(
          Effect.sync(() => {
            running.set(index, { fake, runtime });
            changed();
          }),
          () =>
            Effect.sync(() => {
              running.delete(index);
              changed();
            }),
        );
        return fake.serve(runtime);
      }),
    );
  const [first, ...rest] = fakes.map(layerOf);
  const layer = first ? Layer.mergeAll(first, ...rest) : Layer.empty;

  return {
    fakes,
    layer: layer as Layer.Layer<any, any, any>,
    get runtimes() {
      return runtimes;
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
  };
};

/** The Fake World: run an app's Fakes, keep them across reloads, and Start fresh. */
export const FakeWorld = { make, indexedDb, startFresh, beforeStart };
