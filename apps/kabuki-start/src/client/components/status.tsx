import type { ReactNode } from 'react';
import { Router } from '@kestack/kabuki/routing';
import type { Status } from '@kestack/kabuki/routing';
import { buttonVariants } from '@kestack/web-platform/components/button';

/*
 * A page's data as its View draws it: grey bars while it loads, why it
 * failed with a button that retries, or the page, dimmed while it loads
 * again behind what it shows. It is only a `switch` on `status`: a page can
 * write its own.
 */

/** Grey bars where a page's content will be. */
export function Skeleton({
  label,
  lines = 4,
}: {
  readonly label: string;
  readonly lines?: number;
}) {
  return (
    <div aria-busy aria-label={label} className="space-y-2.5">
      {Array.from({ length: lines }, (_, at) => (
        <div
          key={at}
          className="h-3.5 animate-pulse rounded bg-muted"
          style={{ width: `${92 - ((at * 17) % 30)}%` }}
        />
      ))}
      <p className="font-mono text-[11px] text-muted-foreground">{label}</p>
    </div>
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
    <div role="alert" className="space-y-2">
      <h2 className="font-semibold">{title}</h2>
      <p className="font-mono text-xs text-muted-foreground">{reason}</p>
      {retry && (
        <Router.Retry
          className={buttonVariants({ variant: 'outline', size: 'sm' })}
        >
          Try again
        </Router.Retry>
      )}
    </div>
  );
}

/**
 * Draws a page's `status`: `label` while it loads, its failure, or
 * `children` with its data. Not found says so, with no retry.
 */
export function Loaded<D>({
  status,
  label,
  lines,
  children,
}: {
  readonly status: Status<D>;
  readonly label: string;
  readonly lines?: number;
  readonly children: (data: D) => ReactNode;
}) {
  switch (status._tag) {
    case 'Loading':
      return <Skeleton label={label} {...(lines ? { lines } : {})} />;
    case 'Failed':
      return status.notFound ? (
        <Failed
          title="Not found"
          reason="Its Loader found nothing here: a 404."
          retry={false}
        />
      ) : (
        <Failed title="This page broke" reason={status.reason} />
      );
    case 'Ready':
      return (
        <div
          className={status.refreshing ? 'opacity-60' : ''}
          aria-busy={status.refreshing}
        >
          {children(status.data)}
        </div>
      );
  }
}
