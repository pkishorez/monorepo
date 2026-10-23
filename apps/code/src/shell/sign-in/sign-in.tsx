import { Effect, Layer } from 'effect';
import {
  browser,
  browserAccountsTable,
  localAccountsTable,
  localChooser,
} from '@kestack/auth-toolkit/client/browser';
import { IDB } from '@kestack/std-toolkit/db/idb';
import { Button } from '@kestack/web-platform/components/button';
import { Spinner } from '@kestack/web-platform/components/spinner';
import { LocalSignIn } from '@kestack/web-platform/recipes/local-sign-in';
import {
  createContext,
  type ReactNode,
  useContext,
  useSyncExternalStore,
} from 'react';
import { Mark } from '../../ui/mark/index.ts';

/*
 * Signing in: who uses the app, through auth-toolkit's `Accounts`.
 *
 * 1. Accounts  `accounts` is the browser's Layer: through the Auth Worker
 *              at `VITE_AUTH_URL`, its Accounts last seen kept here without
 *              tokens; or, with `VITE_AUTH_LOCAL=true`, Local Accounts,
 *              signed in by typing an email and kept here. The same email
 *              is the same User `ai-toolkit serve --as <email>` signs in.
 * 2. Ask       in Local mode, the Local Sign-In asks who signs in.
 * 3. Screens   signed out, a screen to sign in; nothing else opens.
 * 4. Slot      where the Account Switcher is drawn, handed from the root
 *              to the pages' headers.
 */

const local = import.meta.env.VITE_AUTH_LOCAL === 'true';

/** Who answers the Local Sign-In: one per app. */
const chooser = localChooser();

const table = <T extends Parameters<typeof IDB.make>[0]>(of: T) =>
  Layer.unwrap(
    Effect.sync(
      () =>
        IDB.make(of, {
          database: IDB.database({ databaseName: 'code:accounts' }),
        }).layer,
    ),
  );

// 1. Accounts
// Made once the Layer is built, in the browser: never as the module loads.
export const accounts = Layer.unwrap(
  Effect.sync(() =>
    local
      ? browser({
          local: {
            choose: chooser.choose,
            storage: table(localAccountsTable),
          },
        })
      : browser({
          url: import.meta.env.VITE_AUTH_URL ?? '',
          cache: table(browserAccountsTable),
        }),
  ),
);

/** The Auth Worker's Home Page, where a Sign-in is revoked; null in Local mode. */
export const authHome = local
  ? null
  : `${(import.meta.env.VITE_AUTH_URL ?? '').replace(/\/+$/, '')}/`;

// 2. Ask
/** The Local Sign-In, open while a sign-in waits for who; nothing outside Local mode. */
export function LocalSignInDialog() {
  const asking = useSyncExternalStore(
    chooser.subscribe,
    chooser.isAsking,
    () => false,
  );
  if (!local) return null;
  return (
    <LocalSignIn
      open={asking}
      presets={[]}
      onChoose={chooser.answer}
      onCancel={() => chooser.answer(null)}
    />
  );
}

// 3. Screens
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

// 4. Slot
const Slot = createContext<ReactNode>(null);

/** Hands the Account Switcher, drawn, to the headers below. */
export const AccountSlot = Slot.Provider;

/** The Account Switcher, where a header draws it. */
export function Account() {
  return useContext(Slot);
}
