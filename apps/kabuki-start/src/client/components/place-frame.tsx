import type { ReactNode } from 'react';
import type { Status } from '@kestack/kabuki/routing';
import { Badge } from '@kestack/web-platform/components/badge';
import { Start } from '@kestack/kabuki/start';
import { router } from '../../shared/index.ts';
import type { Place } from '../../shared/index.ts';

/*
 * The card every Place is drawn in, nested as the URL is. Its header names
 * the page and says what is happening, as badges, from its `status.info`:
 * its Render Mode, where its data is, who drew it, where its data came
 * from and how long it took, and its Stale time if it has one.
 */

const STATE = {
  Loading: 'loading',
  Failed: 'failed',
  Ready: 'ready',
} as const;

const FROM = {
  server: 'data came with the page',
  browser: 'data loaded by the browser',
  cache: 'data from the cache',
} as const;

function Facts({
  place,
  status,
}: {
  readonly place: Place;
  readonly status: Status<unknown> | undefined;
}) {
  const drawn = Start.useDrawn();
  const info = status?.info;
  const render =
    info?.render ??
    router.every.find((each) => each.name === place)?.render ??
    'static';
  const data = status?._tag === 'Ready' ? status.info : undefined;
  return (
    <div className="flex flex-wrap gap-1.5">
      <Badge variant="secondary">{render}</Badge>
      {status && (
        <Badge variant={status._tag === 'Failed' ? 'destructive' : 'outline'}>
          {status._tag === 'Ready' && status.refreshing
            ? 'refreshing'
            : STATE[status._tag]}
        </Badge>
      )}
      <Badge variant="outline">
        drawn by the {drawn?.hydrated ? 'server' : 'browser'}
      </Badge>
      {data && (
        <Badge variant="outline">
          {FROM[data.from]}
          {data.took !== null && ` · ${data.took} ms`}
        </Badge>
      )}
      {info?.staleTime ? (
        <Badge variant="outline">stale time {info.staleTime / 1000} s</Badge>
      ) : null}
    </div>
  );
}

export function PlaceFrame({
  place,
  status,
  title,
  intro,
  aside,
  fill = false,
  children,
}: {
  readonly place: Place;
  /** Its data's Status; none for a page with no data. */
  readonly status?: Status<unknown>;
  /** Its heading; the place's name unless said. */
  readonly title?: ReactNode;
  /** One line on what to try. */
  readonly intro?: ReactNode;
  /** Beside the title: a button. */
  readonly aside?: ReactNode;
  /** From the `lg` width, fill the height it is given, its content the rest of it: a pane. */
  readonly fill?: boolean;
  readonly children?: ReactNode;
}) {
  return (
    <section
      className={`min-w-0 rounded-xl border border-border bg-card ${fill ? 'lg:flex lg:h-full lg:flex-col' : ''}`}
    >
      <header className="space-y-3 border-b border-border p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <h1 className="text-lg font-semibold tracking-tight">
              {title ?? place}
            </h1>
            <p className="font-mono text-xs text-muted-foreground">
              {place} · {router.paths()[place]}
            </p>
          </div>
          {aside}
        </div>
        {intro && (
          <p className="max-w-prose text-sm text-muted-foreground">{intro}</p>
        )}
        <Facts place={place} status={status} />
      </header>
      <div
        className={`space-y-5 p-5 ${fill ? 'lg:flex lg:min-h-0 lg:flex-1 lg:flex-col' : ''}`}
      >
        {children}
      </div>
    </section>
  );
}
