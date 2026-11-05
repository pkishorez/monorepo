import { GoogleButton } from '@kestack/web-platform/ui/components/google-button';
import { CircleAlert } from 'lucide-react';
import { Spinner } from '@kestack/web-platform/ui/components/spinner';
import { type ReactNode, useEffect } from 'react';
import { Mark } from '../../ui/page/theme/index.ts';
import { type Away, AccountList, wordsOf } from './away.tsx';

/*
 * What is drawn in place of the app: one screen in three steps, the mark at
 * the same place in each and on the iOS Splash, so nothing moves from the
 * launch to signing in. The App Shell paints it before any script runs, the
 * root page draws it while no Account is active, and an Account's page while
 * it is not the one active.
 *
 * 1. Reading   the app starts and this device is read: the mark and the
 *              name under it, with nothing else to say what this is, from
 *              the first paint.
 * 2. Checking  the Auth Worker is asked who is signed in, and nothing kept
 *              says: the same, and once the wait is long enough to see, it
 *              says so quietly under the name, so a quick answer goes
 *              straight to signing in or to the app.
 * 3. Sign in   the one screen to sign in from: "Continue with Google",
 *              which leaves for Google at once (under the dev Fake, it
 *              asks for an email), and why it failed, if it did. On an
 *              Account's page that is not the one active, it says why
 *              first (`away.tsx`), and lists the Accounts signed in on
 *              this browser to switch to. The heading, the line under it
 *              and the buttons rise into place one after another, under
 *              the mark, and the credit last.
 */

/** What is drawn before the app: the mark, checking who is signed in, or signing in. */
export type Start = 'reading' | 'checking' | 'signed-out';

/**
 * The mark and what the step says under it. The mark is where signing in
 * centres, a block 264 points tall on a phone and 266 on a tablet or a desktop, and where
 * the iOS Splash draws it (`scripts/draw-install.ts`), whatever is under it:
 * so an error or a status that appears below moves nothing above it.
 */
export function Screen({ children }: { readonly children?: ReactNode }) {
  return (
    <main className="flex min-h-dvh flex-col items-center px-6 pt-[max(2rem,calc(50dvh-132px))] pb-8 min-[744px]:pt-[max(2rem,calc(50dvh-133px))]">
      <div className="flex w-full max-w-xs flex-col items-center gap-6 text-center">
        <Mark className="size-14 min-[744px]:size-18" />
        {children}
      </div>
    </main>
  );
}

/** One part of the step, rising into place `order` beats after the first. */
export function Rise({
  order,
  className,
  children,
}: {
  readonly order: number;
  readonly className?: string;
  readonly children: ReactNode;
}) {
  return (
    <div
      className={`animate-rise ${className ?? ''}`}
      style={{ animationDelay: `${order * 70}ms` }}
    >
      {children}
    </div>
  );
}

/** Before the app: reading this device, checking who is signed in, or signing in. */
export function StartScreen({
  start,
  problem,
  leaving = false,
  onSignIn,
}: {
  readonly start: Start;
  readonly problem: string | null;
  /** Whether the page is leaving for Google. */
  readonly leaving?: boolean;
  readonly onSignIn: () => void;
}) {
  // 1. Reading, 2. Checking
  if (start !== 'signed-out')
    return (
      <Screen>
        <span className="font-mono text-2xl leading-none font-medium tracking-[-0.02em]">
          code
        </span>
        {start === 'checking' && (
          <p
            role="status"
            className="flex animate-arrive items-center gap-2 text-sm text-muted-foreground"
          >
            <Spinner /> Checking who is signed in…
          </p>
        )}
      </Screen>
    );
  // 3. Sign in, with no Account to switch to.
  return (
    <SignInScreen
      away={null}
      problem={problem}
      leaving={leaving}
      onSignIn={onSignIn}
    />
  );
}

/** Who the app is powered by, as the iOS Splash says it: the ke logo, then "stack". */
function Credit() {
  return (
    <p className="flex items-center gap-1.5 text-[13px] text-muted-foreground">
      powered by
      <span className="flex items-center gap-1 font-medium text-foreground">
        <img
          src="/ke-stack.svg"
          alt="ke"
          width={20}
          height={20}
          // Black on white in the light theme, flipped in the dark.
          className="size-5 rounded-[5px] dark:invert"
        />
        stack
      </span>
    </p>
  );
}

/** 3. Sign in: why, when the page is an Account's; signing in; and the Accounts to switch to. */
export function SignInScreen({
  away,
  problem,
  leaving = false,
  onSignIn,
  onChoose = () => {},
}: {
  /** Why the page's Account is not drawn, and who is signed in here; null for none. */
  readonly away: Away | null;
  /** Why signing in, or a switch, failed, until it is tried again. */
  readonly problem: string | null;
  /**
   * Whether the page is leaving for Google: Google's button has no busy
   * look, so it is disabled and the line under it says so.
   */
  readonly leaving?: boolean;
  readonly onSignIn: () => void;
  /** Switches to an Account signed in here, by its id. */
  readonly onChoose?: (id: string) => void;
}) {
  // Back from Google, a page the browser kept is drawn as it left, the
  // button still disabled: it is read again instead.
  useEffect(() => {
    if (!leaving) return;
    const back = (event: PageTransitionEvent) => {
      if (event.persisted) window.location.reload();
    };
    window.addEventListener('pageshow', back);
    return () => window.removeEventListener('pageshow', back);
  }, [leaving]);
  const words =
    away === null
      ? {
          title: (
            <>
              Sign in to{' '}
              <span className="font-mono font-medium tracking-normal">
                code
              </span>
            </>
          ),
          line: 'Connect with your coding agents from any device.',
        }
      : wordsOf(away.why);
  return (
    <Screen>
      <div className="flex flex-col gap-2">
        <Rise order={0}>
          <h1 className="text-xl font-semibold tracking-tight text-balance break-words">
            {words.title}
          </h1>
        </Rise>
        <Rise order={1}>
          <p className="text-sm text-balance text-muted-foreground">
            {words.line}
          </p>
        </Rise>
      </div>
      <Rise order={2} className="flex w-full flex-col gap-3">
        <GoogleButton
          theme="auto"
          label="Continue with Google"
          className="mx-auto"
          disabled={leaving}
          aria-busy={leaving || undefined}
          onClick={onSignIn}
        />
        {leaving && (
          <p
            role="status"
            className="flex items-center justify-center gap-2 text-sm text-muted-foreground"
          >
            <Spinner /> Opening Google…
          </p>
        )}
        {problem !== null && (
          <p
            role="alert"
            className="flex items-start gap-2 text-left text-sm text-destructive"
          >
            <CircleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
            {problem}
          </p>
        )}
      </Rise>
      {away !== null && away.accounts.length > 0 && (
        <Rise order={3} className="w-full">
          <AccountList away={away} onChoose={onChoose} />
        </Rise>
      )}
      <Rise order={4}>
        <Credit />
      </Rise>
    </Screen>
  );
}
