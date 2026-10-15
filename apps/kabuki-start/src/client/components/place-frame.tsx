import { AnimatePresence, motion } from 'motion/react';
import type { ReactNode } from 'react';
import type { Status } from '@kestack/kabuki/routing';
import { Start } from '@kestack/kabuki/start';
import { Routes } from '../../shared/index.ts';
import type { Place } from '../../shared/index.ts';
import { clock } from './clock.ts';
import { MODE, modesOf } from './modes.ts';
import { quick } from './motion.ts';
import { chip } from './styles.ts';

/*
 * The box every Place is drawn in, so the tree of the URL is the tree on
 * screen. Its edge is the color of its Render Mode, and its header says,
 * from facts alone:
 *
 * - its dotted name and its path, as the Routes write them;
 * - its Render Mode and its scroll mode, as its pages say;
 * - where its data is: loading, ready, loading again, or failed;
 * - who drew it: the server, if it was in the page the server sent and was
 *   hydrated, else the browser, after a move or because it is a client page;
 * - where its data came from: every Loader stamps when it ran, so data
 *   loaded before the server drew the page came with it, and data loaded
 *   after was fetched by the browser, or kept in its Data cache.
 */

type Timed = { readonly startedAt: number; readonly loadedAt: number };

const STATE = {
  none: { label: 'no data', tone: 'text-muted-foreground' },
  loading: { label: 'loading', tone: 'text-muted-foreground' },
  ready: { label: 'ready', tone: 'text-foreground' },
  refreshing: { label: 'loading again', tone: 'text-foreground' },
  failed: { label: 'failed', tone: 'text-destructive' },
} as const;

const stateOf = (status: Status<unknown> | undefined): keyof typeof STATE =>
  !status
    ? 'none'
    : status._tag === 'Loading'
      ? 'loading'
      : status._tag === 'Failed'
        ? 'failed'
        : status.refreshing
          ? 'refreshing'
          : 'ready';

function Provenance({ data }: { readonly data: Timed | undefined }) {
  const drawn = Start.useDrawn();
  const by = drawn?.hydrated ? 'server' : 'browser';
  const from =
    data === undefined
      ? undefined
      : drawn && data.loadedAt <= drawn.at
        ? 'came with the page'
        : 'loaded in the browser';
  return (
    <p
      data-testid="provenance"
      data-drawn={by}
      className="flex flex-wrap gap-x-3 gap-y-0.5 font-mono text-[11px] text-muted-foreground"
    >
      <span>
        drawn by{' '}
        <span className="text-foreground">
          {by === 'server' && drawn
            ? `the server, ${clock(drawn.at)}`
            : 'the browser'}
        </span>
      </span>
      {data && from && (
        <span>
          data <span className="text-foreground">{from}</span>, its Loader took{' '}
          <span className="text-foreground tabular-nums">
            {data.loadedAt - data.startedAt} ms
          </span>
        </span>
      )}
    </p>
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
  className = '',
}: {
  readonly place: Place;
  /** Its data's Status; none for a page with no data. */
  readonly status?: Status<unknown>;
  readonly title?: ReactNode;
  readonly intro?: ReactNode;
  /** Beside the title: a button. */
  readonly aside?: ReactNode;
  /** From the `lg` width, fill the height it is given, its content the rest of it: a pane. */
  readonly fill?: boolean;
  readonly children?: ReactNode;
  readonly className?: string;
}) {
  const { render, scroll } = modesOf(place);
  const mode = MODE[render];
  const state = stateOf(status);
  const data =
    status?._tag === 'Ready' ? (status.data as Timed | undefined) : undefined;
  return (
    <section
      data-testid={`place:${place}`}
      data-mode={render}
      data-scroll={scroll}
      className={`min-w-0 rounded-xl border border-l-[3px] border-border bg-card/60 shadow-xs ${mode.edge} ${fill ? 'lg:flex lg:h-full lg:flex-col' : ''} ${className}`}
    >
      <header className="space-y-1.5 border-b border-border/70 px-3.5 py-2.5 sm:px-4">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="mr-1 font-mono text-xs font-semibold">{place}</span>
          <span className="mr-auto font-mono text-[11px] text-muted-foreground">
            {Routes.paths()[place]}
          </span>
          <span className={chip} title={mode.what}>
            <span aria-hidden className={`size-1.5 rounded-full ${mode.dot}`} />
            <span className={mode.text}>{render}</span>
          </span>
          <span className={chip} title={`scroll: ${scroll}`}>
            <span aria-hidden className="text-muted-foreground">
              ⇅
            </span>
            {scroll}
          </span>
          <motion.span
            layout
            transition={quick}
            className={`${chip} overflow-hidden`}
            data-testid="state"
            data-state={state}
          >
            <AnimatePresence mode="popLayout" initial={false}>
              <motion.span
                key={state}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={quick}
                className={`flex items-center gap-1.5 ${STATE[state].tone}`}
              >
                {(state === 'loading' || state === 'refreshing') && (
                  <span
                    aria-hidden
                    className="size-1.5 animate-pulse rounded-full bg-current"
                  />
                )}
                {STATE[state].label}
              </motion.span>
            </AnimatePresence>
          </motion.span>
        </div>
        <Provenance data={data} />
      </header>
      <div
        className={`space-y-5 p-3.5 sm:p-5 ${fill ? 'lg:flex lg:min-h-0 lg:flex-1 lg:flex-col' : ''}`}
      >
        {(title || aside) && (
          <div className="flex flex-wrap items-center justify-between gap-3">
            {title && (
              <h1 className="text-2xl font-semibold tracking-tight text-balance sm:text-3xl">
                {title}
              </h1>
            )}
            {aside}
          </div>
        )}
        {intro && (
          <p className="max-w-prose text-[0.9375rem] leading-relaxed text-pretty text-muted-foreground">
            {intro}
          </p>
        )}
        {children}
      </div>
    </section>
  );
}
