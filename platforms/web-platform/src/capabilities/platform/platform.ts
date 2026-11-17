import * as Cause from 'effect/Cause';
import type * as Context from 'effect/Context';
import * as Effect from 'effect/Effect';
import * as Layer from 'effect/Layer';

/**
 * What the page runs in: a browser, or the app's native shell on iOS or
 * Android, which is the same page in a web view.
 */
export type Platform = 'web' | 'ios' | 'android';

/** A platform with a shell around the page. */
export type Native = Exclude<Platform, 'web'>;

/**
 * Where this page runs, read from what Capacitor's shell puts into the page
 * before any script: its bridge to native code. Nothing of Capacitor is
 * imported for it, and a server is `web`.
 */
export const platform = (): Platform => {
  const page = globalThis as {
    readonly androidBridge?: unknown;
    readonly webkit?: {
      readonly messageHandlers?: { readonly bridge?: unknown };
    };
  };
  if (page.androidBridge !== undefined) return 'android';
  if (page.webkit?.messageHandlers?.bridge !== undefined) return 'ios';
  return 'web';
};

/**
 * How a Capability is made on one platform: an Effect, run only on that
 * platform, so what it imports is loaded nowhere else.
 */
export type Make<S> = Effect.Effect<S, unknown>;

/**
 * A Capability's Layer for an app with a shell: on a platform named, the
 * Capability is the one made for it; anywhere else, and when making it
 * fails, the Capability keeps its default, the web's.
 */
export const layerOn =
  <S>(capability: Context.Reference<S>) =>
  (by: { readonly [P in Native]?: Make<S> }): Layer.Layer<never> =>
    Layer.unwrap(
      Effect.suspend(() => {
        const on = platform();
        const make = on === 'web' ? undefined : by[on];
        if (make === undefined) return Effect.succeed(Layer.empty);
        return make.pipe(
          Effect.map((service) => Layer.succeed(capability, service)),
          // A defect too: a plugin that throws must not break the app's Layer.
          Effect.catchCause((cause) =>
            Effect.sync(() => {
              console.error(
                `web-platform/capabilities: ${capability.key} keeps its web default on ${on}`,
                Cause.squash(cause),
              );
              return Layer.empty;
            }),
          ),
        );
      }),
    );
