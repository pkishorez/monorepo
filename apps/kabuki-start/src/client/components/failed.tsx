import type { ReactNode } from 'react';

/*
 * What a page's slot shows when the move to it broke: the app's failed
 * screen, and the one a page writes for itself, with its own way to retry.
 */

export function Failed({
  title,
  reason,
  children,
}: {
  readonly title: string;
  /** Why it broke, as the Router heard it. */
  readonly reason: string;
  readonly children?: ReactNode;
}) {
  return (
    <section
      data-testid="failed"
      role="alert"
      className="max-w-2xl space-y-3 rounded-xl border border-destructive/40 bg-destructive/5 p-5"
    >
      <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
      <pre className="overflow-x-auto font-mono text-xs whitespace-pre-wrap text-muted-foreground">
        {reason}
      </pre>
      {children}
    </section>
  );
}

/** Grey bars where a page's content will be: what a pending screen draws. */
export function Skeleton({ label }: { readonly label: string }) {
  return (
    <section
      data-testid="pending-screen"
      aria-busy
      aria-label={label}
      className="max-w-2xl animate-pulse space-y-4"
    >
      <div className="h-8 w-2/3 rounded-md bg-muted" />
      <div className="h-4 w-full rounded bg-muted" />
      <div className="h-4 w-5/6 rounded bg-muted" />
      <p className="font-mono text-xs text-muted-foreground">{label}</p>
    </section>
  );
}
