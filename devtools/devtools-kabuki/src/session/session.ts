import { Cause, Effect, Layer } from 'effect';
import { dual } from 'effect/Function';
import { RpcTest } from 'effect/rpc';
import type { Scope } from 'effect';
import type { AppRuntime, Attachment } from '@kestack/kabuki/react/view';
import { DEFAULT_ENVIRONMENT, KabukiSessionApi } from '../api/index.ts';
import type { KabukiSessionClient } from '../api/index.ts';
import { answers } from './answers/index.ts';
import { askedIn, keep, nameFor, tabStorage } from './name.ts';
import { dialUrl, served } from './socket/index.ts';

/*
 * A Kabuki Session: one running app, answering the Kabuki Session Api.
 *
 * 1. Connect   to the DevTools Server: the app dials it under a name and
 *              answers over that socket, redialing while it runs. By
 *              default at `/__devtools` on the page's own origin, where
 *              the Web Platform's Vite plugin proxies it while developing,
 *              so a tunnel to the app reaches DevTools too. Nowhere
 *              without sockets, as on a server. It never throws into the
 *              app.
 * 2. In memory the same answers in the page itself, with nothing
 *              serialized: what the in-page dock's Inspector reads.
 */

export interface ConnectOptions {
  /** The DevTools Server: `/__devtools` on the page's origin, the default, or a whole URL such as `wss://devtools.example.com`. */
  readonly url?: string;
  /** The name to ask for, after one the page's URL asks for. */
  readonly name?: string;
  /** Where it runs, as DevTools groups it: the page's host by default, else `default`; `os.hostname()` suits a server. */
  readonly environment?: string;
}

/** Where the Web Platform's Vite plugin proxies the DevTools Server on the app's own origin while developing. */
export const DEVTOOLS_PATH = '/__devtools';

export { ASKED } from './name.ts';

const stopped = () => {};

const pageOf = () => globalThis.location?.href ?? '';

const appOf = (runtime: AppRuntime) => runtime.name;

/** The Environment given, else the page's host, else `default`. */
const environmentOf = (given: string | undefined) =>
  given || globalThis.location?.host || DEFAULT_ENVIRONMENT;

// 1. Connect
const start = (runtime: AppRuntime, options: ConnectOptions): (() => void) => {
  if (typeof globalThis.WebSocket !== 'function') return stopped;
  try {
    const app = appOf(runtime);
    const environment = environmentOf(options.environment);
    const kept = tabStorage();
    let name = nameFor({ app, page: pageOf(), given: options.name, kept });
    // The tab keeps the name it asked for, never one DevTools answered on a
    // clash: its own last socket, not yet closed, may be what clashed.
    keep(kept, app, name);
    const about = {
      url: pageOf,
      name: () => name,
      named: (final: string) => {
        name = final;
      },
    };
    const fiber = Effect.runFork(
      Layer.launch(
        served(answers(runtime, about), () =>
          dialUrl(options.url ?? DEVTOOLS_PATH, {
            name,
            url: pageOf(),
            app,
            environment,
          }),
        ),
      ).pipe(
        Effect.catchCause((cause) =>
          Effect.sync(() => {
            if (!Cause.hasInterruptsOnly(cause))
              console.error(
                `[@kestack/devtools-kabuki] ${app} stopped answering DevTools:\n${Cause.pretty(cause)}`,
              );
          }),
        ),
      ),
    );
    return () => fiber.interruptUnsafe();
  } catch (error) {
    console.error(
      '[@kestack/devtools-kabuki] could not connect to DevTools',
      error,
    );
    return stopped;
  }
};

/**
 * Connect a running app to DevTools as a Kabuki Session: `connect(runtime,
 * options)` returns how to stop; `connect(options)` is an Attachment, for
 * the app's `attach`.
 */
export const connect: {
  (options?: ConnectOptions): Attachment;
  (runtime: AppRuntime, options?: ConnectOptions): () => void;
} = dual(
  // A runtime first, options or none after; else options or none alone.
  (args) => typeof args[0]?.start === 'function',
  (runtime: AppRuntime, options: ConnectOptions = {}) =>
    start(runtime, options),
);

// 2. In memory
/**
 * An Api client answered by the app in this page, with nothing
 * serialized; it lasts as long as the Scope. Its Kabuki Session is named
 * as the page's URL asks, else after the app.
 */
export const inMemory = (
  runtime: AppRuntime,
): Effect.Effect<KabukiSessionClient, never, Scope.Scope> => {
  let name = askedIn(pageOf()) ?? appOf(runtime);
  return RpcTest.makeClient(KabukiSessionApi).pipe(
    Effect.provide(
      answers(runtime, {
        url: pageOf,
        name: () => name,
        named: (final) => {
          name = final;
        },
      }),
    ),
  );
};
