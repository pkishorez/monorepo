import { Cause, Effect, Layer } from 'effect';
import { dual } from 'effect/Function';
import { RpcTest } from 'effect/rpc';
import type { Scope } from 'effect';
import type { AppRuntime, Attachment } from '@kestack/kabuki/react';
import { KabukiSessionApi } from '../api/index.ts';
import type { KabukiSessionClient } from '../api/index.ts';
import { answers } from './answers/index.ts';
import { askedIn, keep, nameFor, tabStorage } from './name.ts';
import { dialUrl, served } from './socket/index.ts';

/*
 * A Kabuki Session: one running app, answering the Kabuki Session Api.
 *
 * 1. Connect   to the DevTools Server: the app dials it under a name and
 *              answers over that socket, redialing while it runs; or only
 *              when the page's URL asks for a Kabuki Session (`'asked'`).
 *              Nowhere without sockets, as on a server. It never throws
 *              into the app.
 * 2. In memory the same answers in the page itself, with nothing
 *              serialized: what the in-page dock's Inspector reads.
 */

export interface ConnectOptions {
  /** The DevTools Server, `ws://127.0.0.1:14400`. */
  readonly url: string;
  /** The name to ask for, after one the page's URL asks for. */
  readonly name?: string;
  /** `'always'`, the default; `'asked'` connects only when the page's URL has `?kabuki-session`. */
  readonly when?: 'always' | 'asked';
}

export { ASKED } from './name.ts';

const stopped = () => {};

const pageOf = () => globalThis.location?.href ?? '';

const appOf = (runtime: AppRuntime) => runtime.name;

// 1. Connect
const start = (runtime: AppRuntime, options: ConnectOptions): (() => void) => {
  if (typeof globalThis.WebSocket !== 'function') return stopped;
  try {
    const page = pageOf();
    if (options.when === 'asked' && askedIn(page) === undefined) return stopped;
    const app = appOf(runtime);
    const kept = tabStorage();
    let name = nameFor({ app, page, given: options.name, kept });
    keep(kept, app, name);
    const about = {
      url: pageOf,
      name: () => name,
      named: (final: string) => {
        name = final;
        keep(kept, app, final);
      },
    };
    const fiber = Effect.runFork(
      Layer.launch(
        served(answers(runtime, about), () =>
          dialUrl(options.url, { name, url: pageOf(), app }),
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
  (options: ConnectOptions): Attachment;
  (runtime: AppRuntime, options: ConnectOptions): () => void;
} = dual(2, start);

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
