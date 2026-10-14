import { Start } from '@kestack/kabuki/start';
import { Routes } from '../../shared/index.ts';
import type { Place } from '../../shared/index.ts';
import { clock } from './clock.ts';

/*
 * How a page on screen came to be, from facts alone:
 *
 * - its Render Mode, as the Routes say;
 * - who drew it: the server, if it was in the page the server sent and was
 *   hydrated, else the browser, after a move or because it is a client page;
 * - where its data came from: every Loader stamps when it ran, so data
 *   loaded before the server drew this page came with it, and data loaded
 *   later was fetched by the browser from /_kabuki/load, or kept in the
 *   browser's Data cache;
 * - how long its Loader took, and when it started: two pages whose Loaders
 *   started together loaded side by side.
 */

const tone = {
  server: 'text-positive',
  browser: 'text-sky-600 dark:text-sky-400',
  none: 'text-muted-foreground',
} as const;

export function Provenance({
  place,
  data,
}: {
  readonly place: Place;
  /** When its Loader started and answered; none for a page with no data. */
  readonly data?: { readonly startedAt: number; readonly loadedAt: number };
}) {
  const drawn = Start.useDrawn();
  const mode = Routes.every.find((each) => each.name === place)?.render;
  const by = drawn?.hydrated ? 'server' : 'browser';
  const from =
    data === undefined
      ? 'none'
      : drawn && data.loadedAt <= drawn.at
        ? 'server'
        : 'browser';
  return (
    <dl
      data-testid="provenance"
      data-place={place}
      data-mode={mode}
      data-drawn={by}
      data-from={from}
      className="grid max-w-2xl grid-cols-[auto_1fr] gap-x-4 gap-y-1 rounded-lg border border-dashed border-border bg-muted/40 px-3.5 py-2.5 font-mono text-xs leading-relaxed"
    >
      <dt className="text-muted-foreground">place</dt>
      <dd>{place}</dd>
      <dt className="text-muted-foreground">mode</dt>
      <dd>{mode}</dd>
      <dt className="text-muted-foreground">drawn by</dt>
      <dd className={tone[by]}>
        {by === 'server' && drawn
          ? `the server at ${clock(drawn.at)}, build ${drawn.build?.slice(0, 8) ?? 'dev'}`
          : 'the browser'}
      </dd>
      <dt className="text-muted-foreground">data</dt>
      <dd className={tone[from]}>
        {data === undefined
          ? 'none'
          : `${from === 'server' ? 'came with the page' : 'loaded in the browser'}: started ${clock(data.startedAt)}, took ${data.loadedAt - data.startedAt} ms`}
      </dd>
    </dl>
  );
}
