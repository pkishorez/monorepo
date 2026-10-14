import { Start } from '@kestack/kabuki/start';
import { Routes } from '../routes.ts';
import type { Place } from '../routes.ts';
import { clock } from './time.ts';

/*
 * How a place on screen came to be, from facts alone:
 *
 * - its Render Mode, as the Routes say;
 * - who drew it: the server, if it was in the page the server sent and was
 *   hydrated, else the browser, after a move or because it is a client place;
 * - where its Input came from: every Loader stamps when it ran, so an Input
 *   loaded before the server drew this page came with it, and one loaded
 *   later was fetched by the browser from /_kabuki/load.
 */

const tone = {
  server: 'text-positive',
  browser: 'text-sky-600 dark:text-sky-400',
  none: 'text-muted-foreground',
} as const;

export function Provenance({
  place,
  loadedAt,
}: {
  /** The place, or the not-found Route, which is no place. */
  readonly place: Place | 'NotFound';
  /** When its Input was loaded; none for a place with no Input. */
  readonly loadedAt?: number;
}) {
  const drawn = Start.useDrawn();
  // The not-found Route is no place, so it has no Render Mode.
  const mode =
    Routes.every.find((each) => each.name === place)?.render ?? 'none';
  const by = drawn?.hydrated ? 'server' : 'browser';
  const input =
    loadedAt === undefined
      ? 'none'
      : drawn && loadedAt <= drawn.at
        ? 'server'
        : 'browser';
  return (
    <dl
      data-testid="provenance"
      data-place={place}
      data-mode={mode}
      data-drawn={by}
      data-input={input}
      className="grid max-w-2xl grid-cols-[auto_1fr] gap-x-4 gap-y-1 rounded-lg border border-dashed border-border bg-muted/40 px-3.5 py-2.5 font-mono text-xs leading-relaxed"
    >
      <dt className="text-muted-foreground">place</dt>
      <dd>{place}</dd>
      <dt className="text-muted-foreground">mode</dt>
      <dd data-testid="mode">{mode}</dd>
      <dt className="text-muted-foreground">drawn by</dt>
      <dd data-testid="drawn-by" className={tone[by]}>
        {by === 'server' && drawn ? (
          <>
            the server at <span data-testid="drawn-at">{clock(drawn.at)}</span>,
            build{' '}
            <span data-testid="build">{drawn.build?.slice(0, 8) ?? 'dev'}</span>
          </>
        ) : (
          'the browser'
        )}
      </dd>
      <dt className="text-muted-foreground">input</dt>
      <dd data-testid="input-from" className={tone[input]}>
        {input === 'none' ? (
          'none'
        ) : (
          <>
            {input === 'server'
              ? 'came with the page, loaded at '
              : 'fetched by the browser, loaded at '}
            <span data-testid="loaded-at">{clock(loadedAt!)}</span>
          </>
        )}
      </dd>
    </dl>
  );
}
