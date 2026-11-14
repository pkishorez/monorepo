import * as Effect from 'effect/Effect';
import * as Option from 'effect/Option';
import type { Make } from '../../platform/index.ts';
import type { LiveActivityService } from '../web/index.ts';

/**
 * The Shell's own `LiveActivity` plugin, written beside its ActivityKit
 * widget: no package has one, so its methods are named here as the Swift
 * side has them.
 */
interface Plugin {
  readonly isSupported: () => Promise<{ readonly supported: boolean }>;
  /** Rejects where it is not supported, or iOS refused it. */
  readonly start: (options: {
    readonly title: string;
    readonly status: string;
    readonly progress?: number | undefined;
  }) => Promise<{ readonly id: string }>;
  /** Rejects for an id with nothing running. */
  readonly update: (options: {
    readonly id: string;
    readonly status: string;
    readonly progress?: number | undefined;
  }) => Promise<void>;
  readonly end: (options: { readonly id: string }) => Promise<void>;
}

/**
 * Live Activities on an iPhone, through the Shell's own plugin, reached
 * with `registerPlugin` from `@capacitor/core`, loaded only where this is
 * made. A Shell built without the plugin rejects every call, so it is not
 * supported there.
 */
export const ios: Make<LiveActivityService> = Effect.tryPromise(
  () => import('@capacitor/core'),
).pipe(
  Effect.map(({ registerPlugin }) => {
    // Capacitor's plugin is a Proxy that answers any name with a native
    // call, `then` too, so anything awaiting it would take it for a
    // Promise. It stays inside these functions and is never handed out.
    const plugin = registerPlugin<Plugin>('LiveActivity');
    const took = (call: () => Promise<unknown>) =>
      Effect.tryPromise(call).pipe(
        Effect.as(true),
        Effect.catch(() => Effect.succeed(false)),
      );
    return {
      supported: Effect.tryPromise(() => plugin.isSupported()).pipe(
        Effect.map(({ supported }) => supported === true),
        Effect.catch(() => Effect.succeed(false)),
      ),
      start: ({ title, status, progress }) =>
        Effect.tryPromise(() => plugin.start({ title, status, progress })).pipe(
          Effect.map(({ id }) => Option.some(id)),
          Effect.catch(() => Effect.succeed(Option.none())),
        ),
      update: (id, { status, progress }) =>
        took(() => plugin.update({ id, status, progress })),
      end: (id) => took(() => plugin.end({ id })),
    } satisfies LiveActivityService;
  }),
);
