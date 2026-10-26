import { Button } from '@kestack/web-platform/ui/components/button';
import { CircleAlert } from 'lucide-react';
import { Spinner } from '@kestack/web-platform/ui/components/spinner';
import type { ReactNode } from 'react';
import { Mark } from '../../../ui/page/theme/index.ts';

/*
 * What the root page draws before the app: one screen in three steps, the
 * mark at the same place in each, so going from one to the next never
 * moves it.
 *
 * 1. Reading   the app starts and this device is read: the mark alone,
 *              and only once the start is slow enough to see, so a reload
 *              that opens from what this device kept shows nothing.
 * 2. Checking  no Account was kept, so the Auth Worker is asked: it says
 *              so, as quietly, after the same wait from when it is asked,
 *              so a quick answer goes from the mark, or from nothing,
 *              straight to signing in or to the app.
 * 3. Signed out  the one thing to do is sign in, and why it failed, if it
 *              did: the heading, the line under it and the button rise
 *              into place one after another, under the mark.
 */

/** What is drawn before the app: the mark, checking who is signed in, or signing in. */
export type Start = 'reading' | 'checking' | 'signed-out';

/**
 * The mark, where every step draws it, and what the step says under it.
 * Always the same elements, so the mark already shown stays as it is when
 * the step changes.
 */
function Screen({
  waits,
  children,
}: {
  /** Shown only once the wait is long enough to see. */
  readonly waits: boolean;
  readonly children?: ReactNode;
}) {
  return (
    <main className="flex min-h-dvh flex-col items-center px-6 pt-[30dvh]">
      <div
        className={`flex w-full max-w-xs flex-col items-center gap-6 text-center ${waits ? 'animate-arrive' : ''}`}
      >
        <Mark className="size-10" />
        {children}
      </div>
    </main>
  );
}

/** One part of the step, rising into place `order` beats after the first. */
function Rise({
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
  onSignIn,
}: {
  readonly start: Start;
  readonly problem: string | null;
  readonly onSignIn: () => void;
}) {
  // 1. Reading
  if (start === 'reading') return <Screen waits />;
  // 2. Checking
  if (start === 'checking')
    return (
      <Screen waits>
        <p
          role="status"
          className="flex animate-arrive items-center gap-2 text-sm text-muted-foreground"
        >
          <Spinner /> Checking who is signed in…
        </p>
      </Screen>
    );
  // 3. Signed out: under the mark, one part after another.
  return (
    <Screen waits={false}>
      <div className="flex flex-col gap-2">
        <Rise order={0}>
          <h1 className="text-xl font-semibold tracking-tight text-balance">
            Sign in to code
          </h1>
        </Rise>
        <Rise order={1}>
          <p className="text-sm text-pretty text-muted-foreground">
            Run Claude Code and Codex on your Connections, from any device.
          </p>
        </Rise>
      </div>
      <Rise order={2} className="flex w-full flex-col gap-3">
        <Button size="lg" className="w-full" onClick={onSignIn}>
          Sign in
        </Button>
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
    </Screen>
  );
}
