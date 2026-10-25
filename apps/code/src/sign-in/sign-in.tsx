import { Effect, Layer } from 'effect';
import {
  browser,
  browserAccountsTable,
} from '@kestack/auth-toolkit/client/browser';
import { IDB } from '@kestack/std-toolkit/db/idb';
import { Button } from '@kestack/web-platform/ui/components/button';
import { Spinner } from '@kestack/web-platform/ui/components/spinner';
import { createContext, type ReactNode, useContext } from 'react';
import { Mark } from '../ui/mark/index.ts';

/*
 * Signing in: who uses the app, through auth-toolkit's `Accounts`.
 *
 * 1. Accounts  `accounts` is the browser's Layer: through the Auth Worker
 *              at `VITE_AUTH_URL`, its Accounts last seen kept here without
 *              tokens.
 * 2. Screens   signed out, a screen to sign in; nothing else opens.
 * 3. Slot      where the Account Switcher is drawn, handed from the root
 *              to the pages' headers.
 */

const table = <T extends Parameters<typeof IDB.make>[0]>(of: T) =>
  Layer.unwrap(
    Effect.sync(
      () =>
        IDB.make(of, {
          database: IDB.database({ databaseName: 'code:accounts' }),
          mode: 'disposable',
        }).layer,
    ),
  );

// 1. Accounts
// Made once the Layer is built, in the browser: never as the module loads.
export const accounts = Layer.unwrap(
  Effect.sync(() =>
    browser({
      url: import.meta.env.VITE_AUTH_URL,
      cache: table(browserAccountsTable),
    }),
  ),
);

/** The Auth Worker's Home Page, where a Sign-in is revoked. */
// Tests run with no env at all.
export const authHome = `${(import.meta.env.VITE_AUTH_URL ?? '').replace(/\/+$/, '')}/`;

// 2. Screens
/** Signed out, or still checking: the one thing to do is sign in. */
export function SignedOut({
  checking,
  problem,
  onSignIn,
}: {
  /** Still asking who is signed in. */
  readonly checking: boolean;
  readonly problem: string | null;
  readonly onSignIn: () => void;
}) {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-sm flex-col items-start justify-center gap-4 px-6">
      <Mark className="size-8" />
      {checking ? (
        <p
          role="status"
          className="flex items-center gap-2 text-sm text-muted-foreground"
        >
          <Spinner /> Checking who is signed in…
        </p>
      ) : (
        <>
          <h1 className="text-lg font-semibold">Sign in to code</h1>
          <p className="text-sm text-muted-foreground">
            Your Machines and their sessions are under your account.
          </p>
          {problem !== null && (
            <p className="text-sm text-destructive">{problem}</p>
          )}
          <Button onClick={onSignIn}>Sign in</Button>
        </>
      )}
    </main>
  );
}

// 3. Slot
const Slot = createContext<ReactNode>(null);

/** Hands the Account Switcher, drawn, to the headers below. */
export const AccountSlot = Slot.Provider;

/** The Account Switcher, where a header draws it. */
export function Account() {
  return useContext(Slot);
}
