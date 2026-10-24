import { useSyncExternalStore } from 'react';
import { View } from '@kestack/kabuki/react';
import {
  CircleCheckIcon,
  HourglassIcon,
} from '@kestack/web-platform/ui/components/lucide';
import { Spinner } from '@kestack/web-platform/ui/components/spinner';
import { Pages, router } from '../../shared/pages/index.ts';
import { PageIntro, clock } from '../components/index.ts';
import { PreloadLink } from './preload-link.tsx';

/*
 * Preloading as a list and the item it opens. Each link shows its preload
 * live; the item leads with how it arrived: at once from what the hover
 * loaded, or after a wait. Its copy stays fresh for 30 seconds, counted
 * down, and an id with no item is not found.
 */

/** Items the list adds: one that never preloads, to feel the wait, and one with no item. */
const NEVER = 3;
const MISSING = { id: 9, name: 'Missing item' };

const second = () => Math.floor(Date.now() / 1000) * 1000;
const tick = (changed: () => void) => {
  const timer = setInterval(changed, 1000);
  return () => clearInterval(timer);
};

/** The time now, to the second, drawn again each second; 0 on the server and while hydrating. */
const useNow = () => useSyncExternalStore(tick, second, () => 0);

function Freshness({ until }: { readonly until: number }) {
  const now = useNow();
  if (now === 0) return null;
  const left = Math.floor((until - now) / 1000);
  return (
    <p className="text-sm text-muted-foreground">
      {left > 0 ? (
        <>
          Fresh for{' '}
          <span className="text-foreground tabular-nums">{left} s</span>: open
          another item and come back, and nothing loads.
        </>
      ) : (
        'Stale now: come back and it loads again behind what is shown.'
      )}
    </p>
  );
}

const ItemView = View.make(Pages.ItemLive, ({ root, props }) => {
  const { status } = props;
  return (
    <article {...root} className="space-y-5">
      {status._tag === 'Loading' && (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Spinner /> Loading item {props.params.id}: its Loader takes a second…
        </p>
      )}
      {status._tag === 'Failed' && (
        <div role="alert" className="space-y-1">
          <h2 className="text-lg font-semibold">No item {props.params.id}</h2>
          <p className="text-sm text-muted-foreground">
            {status.notFound
              ? 'Its Loader answered not found, so the server sends this page with a 404.'
              : `Its Loader broke: ${status.reason}`}
          </p>
        </div>
      )}
      {status._tag === 'Ready' && (
        <>
          <div className="flex items-start gap-3">
            {status.info.from === 'browser' ? (
              <HourglassIcon className="mt-1 size-5 text-muted-foreground" />
            ) : (
              <CircleCheckIcon className="mt-1 size-5 text-positive" />
            )}
            <div className="space-y-0.5">
              <p className="text-lg font-semibold tabular-nums">
                {status.info.from === 'cache'
                  ? 'Opened at once'
                  : status.info.from === 'browser'
                    ? `You waited ${((status.info.took ?? 0) / 1000).toFixed(1)} s`
                    : 'Drawn by the server'}
              </p>
              <p className="text-sm text-muted-foreground">
                {status.info.from === 'cache'
                  ? 'Its data was loaded while you hovered.'
                  : status.info.from === 'browser'
                    ? 'Nothing was preloaded, so its Loader ran after the click.'
                    : 'You opened this address directly, so it came with the page.'}
              </p>
            </div>
          </div>
          <div className="space-y-1 border-t border-border pt-5">
            <h2 className="text-xl font-semibold tracking-tight">
              {status.data.name}
            </h2>
            <p className="text-sm text-muted-foreground">
              Its Loader ran at{' '}
              <span className="font-mono text-[13px] tabular-nums">
                {clock(status.data.at)}
              </span>
              .
            </p>
          </div>
          {status.info.freshUntil !== null && (
            <Freshness until={status.info.freshUntil} />
          )}
        </>
      )}
    </article>
  );
});

export const ItemsView = View.make(
  Pages.ItemsLive,
  ({ root, props, children }) => {
    const shown = children.Item ? props.route.page : undefined;
    const items =
      props.status._tag === 'Ready'
        ? [...props.status.data.items, MISSING]
        : [];
    return (
      <div {...root}>
        <PageIntro title="Preloading">
          Hover an item and watch it load before you click; then click, and it
          opens at once.{' '}
          {items.find((each) => each.id === NEVER)?.name ?? 'One item'} never
          preloads, so you can feel the difference.
        </PageIntro>
        <div className="grid gap-6 md:grid-cols-[17rem_1fr]">
          <nav
            aria-label="Items"
            className="rounded-xl border border-border bg-card p-1.5"
          >
            <ul className="space-y-0.5 text-sm">
              {items.map(({ id, name }) => (
                <li key={id}>
                  <PreloadLink
                    to={router.Items.Item({ id })}
                    preload={id === NEVER ? false : 'intent'}
                    current={
                      shown !== undefined && 'id' in shown && shown.id === id
                    }
                  >
                    {name}
                  </PreloadLink>
                </li>
              ))}
            </ul>
          </nav>
          <div className="min-h-64 rounded-xl border border-border bg-card p-6">
            {children.Item ? (
              <ItemView instance={children.Item} />
            ) : (
              <p className="max-w-[45ch] text-sm text-muted-foreground">
                Nothing open yet. Hover an item until it says Ready, then click
                it.
              </p>
            )}
          </div>
        </div>
      </div>
    );
  },
);
