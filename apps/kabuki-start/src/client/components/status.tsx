import { motion } from 'motion/react';
import { useRef } from 'react';
import type { ReactNode } from 'react';
import { Router } from '@kestack/kabuki/routing';
import type { Status } from '@kestack/kabuki/routing';
import { buttonVariants } from '@kestack/web-platform/components/button';
import { settle } from './motion.ts';

/*
 * A page's data as its View draws it: grey bars while it loads, why it
 * failed with a button that retries, or the page, dimmed while it loads
 * again behind what it shows. It is only a `switch` on `status`: a page can
 * write its own. What it shows fades in when it changes, never on the
 * first drawing, so a page the server drew is shown as drawn.
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
    <div
      data-testid="loading"
      aria-busy
      aria-label={label}
      className="space-y-3"
    >
      <div className="h-6 w-2/3 animate-pulse rounded-md bg-muted" />
      {Array.from({ length: lines }, (_, at) => (
        <div
          key={at}
          className="h-3.5 animate-pulse rounded bg-muted"
          style={{ width: `${92 - ((at * 17) % 30)}%` }}
        />
      ))}
      <p className="pt-1 font-mono text-[11px] text-muted-foreground">
        {label}
      </p>
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
    <div
      data-testid="failed"
      role="alert"
      className="space-y-3 rounded-lg border border-destructive/40 bg-destructive/5 p-4"
    >
      <h2 className="font-semibold tracking-tight">{title}</h2>
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
  readonly children: (data: D, refreshing: boolean) => ReactNode;
}) {
  // What was drawn first is shown as it was; anything after fades in.
  const first = useRef<string | null>(status._tag);
  if (first.current !== status._tag) first.current = null;
  const drawn = (() => {
    switch (status._tag) {
      case 'Loading':
        return <Skeleton label={label} {...(lines ? { lines } : {})} />;
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
        return (
          <div
            className={`transition-opacity duration-200 ${status.refreshing ? 'opacity-60' : ''}`}
            aria-busy={status.refreshing}
          >
            {children(status.data, status.refreshing)}
          </div>
        );
    }
  })();
  return (
    <motion.div
      key={status._tag}
      initial={first.current === null ? { opacity: 0, y: 4 } : false}
      animate={{ opacity: 1, y: 0 }}
      transition={settle}
    >
      {drawn}
    </motion.div>
  );
}
