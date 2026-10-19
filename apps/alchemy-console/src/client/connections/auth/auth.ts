import { Effect, ManagedRuntime } from 'effect';
import { Accounts } from '@kestack/auth-toolkit/client';
import { browser } from '@kestack/auth-toolkit/client/browser';
import { authWorkerUrl } from '../../../shared/api/auth-worker/index.ts';

let runtime: ReturnType<typeof make> | undefined;
const make = () => ManagedRuntime.make(browser({ url: authWorkerUrl }));

/** Everything the browser Layer gives: `Accounts`, and the signing of every
 * guarded call. Made once, on first use in the browser, so the sign-in
 * screens and every RPC client share one `Accounts`. */
export const authContext = Effect.suspend(
  () => (runtime ??= make()).contextEffect,
);

/** This browser's `Accounts`. */
export const accounts = Effect.flatMap(authContext, (context) =>
  Effect.provide(
    Accounts.useSync((service) => service),
    context,
  ),
);
