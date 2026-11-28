import { Effect, type Fiber, type Layer, type Scope } from 'effect';
import { History, Runtime, Snapshot } from '@kestack/kabuki';
import type { AnyActor } from '@kestack/kabuki/types';
import type { AppRuntime, Step } from '@kestack/kabuki/react/types';

export interface HeadlessOptions {
  readonly name: string;
  readonly input: unknown;
  readonly layer: Layer.Layer<any>;
  readonly window?: number | null;
}

const WINDOW = 500;

export const headless = <A extends AnyActor>(
  actor: A,
  options: HeadlessOptions,
): Effect.Effect<
  AppRuntime<A> & { readonly runtime: Runtime<A> },
  never,
  Scope.Scope
> =>
  Effect.acquireRelease(
    Effect.promise(async () => {
      let window = options.window === undefined ? WINDOW : options.window;
      let history = History.init(Snapshot.init(actor, options.input));
      let seeking: Step<A> | null = null;
      let failure: AppRuntime['failure'] = null;
      let seeks: Fiber.Fiber<void> | undefined;
      const listeners = new Set<() => void>();
      const changed = () => {
        for (const listener of listeners) listener();
      };
      const runtime: Runtime<A> = Runtime.make(actor, {
        snapshot: History.snapshot(actor, history),
        layer: options.layer,
        running: false,
      } as never);
      runtime.subscribe((entries) => {
        if (entries.length > 0)
          history = History.compact(
            actor,
            History.add(history, entries),
            window,
          );
        changed();
      });
      const fail = (what: string, error: unknown) => {
        failure = { what, error };
        changed();
      };
      const control = (what: string, run: () => Promise<void>) => {
        run().then(
          () => {
            if (failure === null) return;
            failure = null;
            changed();
          },
          (error: unknown) => fail(what, error),
        );
      };
      const toHead = () => {
        seeks?.interruptUnsafe();
        seeks = undefined;
        if (seeking === null) return;
        seeking = null;
        changed();
      };
      const app: AppRuntime<A> & { readonly runtime: Runtime<A> } = {
        name: options.name,
        runtime,
        get history() {
          return history;
        },
        get window() {
          return window;
        },
        keep: (next) => {
          history = History.compact(actor, history, next);
          window = next;
          changed();
        },
        get seeking() {
          return seeking;
        },
        get failure() {
          return failure;
        },
        seek: (entry) => {
          seeks?.interruptUnsafe();
          if (entry !== null && !History.entry(history, entry))
            return fail(
              `seek ${entry}`,
              new RangeError(`No History entry ${entry}`),
            );
          seeks = Effect.runFork(
            History.replay(actor, history, entry).pipe(
              Effect.map((snapshot) => {
                seeking = { entry, at: snapshot.at, snapshot };
                failure = null;
                changed();
              }),
            ),
          );
        },
        toHead,
        fork: (entry) =>
          control(`fork from ${entry ?? 'the start'}`, () => {
            toHead();
            history = History.compact(
              actor,
              History.move(history, entry),
              window,
            );
            return runtime.follow(History.snapshot(actor, history), {
              restart: true,
            });
          }),
        startOver: () =>
          control('start over', () => {
            toHead();
            history = History.init(Snapshot.init(actor, options.input));
            return runtime.follow(History.snapshot(actor, history), {
              restart: true,
            });
          }),
        start: () => control('start', () => runtime.start()),
        stop: () => control('stop', () => runtime.stop()),
        subscribe: (listener) => {
          listeners.add(listener);
          return () => listeners.delete(listener);
        },
      };
      await runtime.start();
      return app;
    }),
    (app) => Effect.promise(() => app.runtime.dispose()),
  );
