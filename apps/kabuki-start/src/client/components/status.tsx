import type { ReactNode } from 'react';
import { Router } from '@kestack/kabuki/routing';
import type { Status } from '@kestack/kabuki/routing';
import { buttonVariants } from '@kestack/web-platform/components/button';

/*
 * A page's data as its View draws it: grey bars while it loads, why it
 * failed with a button that retries, or the page, marked while it loads
 * again behind what it shows. It is only a `switch` on `status`: a page can
 * write its own.
 */

/** Grey bars where a page's content will be. */
export function Skeleton({ label }: { readonly label: string }) {
  return (
    <section
      data-testid="loading"
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

/** Why a page has no data, and a button that loads it again. */
export function Failed({
  title,
  reason,
  retry = true,
}: {
  readonly title: string;
  readonly reason: string;
  /** Whether trying again could help: not for a page that is not there. */
  readonly retry?: boolean;
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
      {retry && (
        <Router.Retry
          className={buttonVariants({ variant: 'outline', size: 'sm' })}
        >
          Try again
        </Router.Retry>
      )}
    </section>
  );
}

/** A small mark while a page loads its data again behind what it shows. */
export function Refreshing({ on }: { readonly on: boolean }) {
  return (
    <span
      data-testid="refreshing"
      data-on={on}
      aria-live="polite"
      className={`inline-flex items-center gap-1.5 font-mono text-xs text-muted-foreground transition-opacity duration-200 ${on ? 'opacity-100' : 'opacity-0'}`}
    >
      <span
        aria-hidden
        className="size-1.5 animate-pulse rounded-full bg-sky-500"
      />
      {on ? 'loading again…' : ''}
    </span>
  );
}

/**
 * Draws a page's `status`: `label` while it loads, its failure, or
 * `children` with its data. Not found says so, with no retry.
 */
export function Loaded<D>({
  status,
  label,
  children,
}: {
  readonly status: Status<D>;
  readonly label: string;
  readonly children: (data: D, refreshing: boolean) => ReactNode;
}) {
  switch (status._tag) {
    case 'Loading':
      return <Skeleton label={label} />;
    case 'Failed':
      return status.notFound ? (
        <Failed
          title="Not found"
          reason="Its Loader found nothing here: the server answered 404."
          retry={false}
        />
      ) : (
        <Failed title="This page broke" reason={status.reason} />
      );
    case 'Ready':
      return children(status.data, status.refreshing);
  }
}
