import { Button } from '@kestack/web-platform/ui/components/button';
import { Spinner } from '@kestack/web-platform/ui/components/spinner';
import { createContext, type ReactNode, useContext } from 'react';
import { Mark } from '../ui/mark/index.ts';

/*
 * Signing in, as the root page draws it; who is signed in comes from
 * auth-toolkit's `Accounts`, which the app's Layer gives.
 *
 * 1. Screens   signed out, a screen to sign in; nothing else opens.
 * 2. Slot      where the Account Switcher is drawn, handed from the root
 *              to the pages' headers.
 */

// 1. Screens
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

// 2. Slot
const Slot = createContext<ReactNode>(null);

/** Hands the Account Switcher, drawn, to the headers below. */
export const AccountSlot = Slot.Provider;

/** The Account Switcher, where a header draws it. */
export function Account() {
  return useContext(Slot);
}
