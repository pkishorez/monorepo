import { View } from '@kestack/kabuki/react';
import { Router } from '@kestack/kabuki/routing';
import type { Preload } from '@kestack/kabuki/routing';
import { Pages, router } from '../../../shared/index.ts';
import { PlaceFrame, Slot } from '../../components/index.ts';

/*
 * Links to slow pages, one row per way a link preloads. Each preload is one
 * Message to the Router: the devtools' Timeline shows them. A slow page's
 * View is lazy, so its code loads with its data. It is drawn in place of
 * the links, sliding in the way the move went.
 */

const SlowView = View.lazy(Pages.SlowLive, () => import('./slow.tsx'));

const ROWS: ReadonlyArray<{
  readonly mode: Preload;
  readonly title: string;
  readonly what: string;
  readonly pages: ReadonlyArray<number>;
}> = [
  {
    mode: 'intent',
    title: 'On hover or focus',
    what: 'the default: rest on a link for 50 ms, then click, and it is there',
    pages: [1, 2, 3],
  },
  {
    mode: 'viewport',
    title: 'Once in view',
    what: 'loaded as soon as the link is on screen',
    pages: [4, 5, 6],
  },
  {
    mode: false,
    title: 'Never',
    what: 'loaded only on the click: its loading screen shows',
    pages: [7, 8, 9],
  },
];

const tile =
  'grid size-12 place-items-center rounded-lg border border-border bg-background font-mono text-sm transition-colors hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none';

export const PreloadView = View.make(Pages.PreloadLive, (self) => {
  const slow = self.children.Slow;
  return (
    <PlaceFrame
      place="Preload"
      title="Preload"
      intro="Every link goes to a page whose Loader takes a second and a half. A link that preloads warms the Data cache, and the page's lazy code, so the page is there when it is clicked."
    >
      <Slot id={slow?.id ?? 'links'}>
        {slow ? (
          <SlowView instance={slow} />
        ) : (
          <div className="grid gap-4 sm:grid-cols-3">
            {ROWS.map(({ mode, title, what, pages }) => (
              <section
                key={String(mode)}
                className="space-y-3 rounded-lg border border-border bg-background/60 p-4"
              >
                <div className="space-y-1">
                  <h2 className="font-medium">{title}</h2>
                  <code className="font-mono text-[11px] text-muted-foreground">
                    preload={JSON.stringify(mode)}
                  </code>
                  <p className="text-sm text-muted-foreground">{what}</p>
                </div>
                <ul className="flex gap-2">
                  {pages.map((n) => (
                    <li key={n}>
                      <Router.Link
                        to={router.Preload.Slow({ n })}
                        preload={mode}
                        className={tile}
                      >
                        {n}
                      </Router.Link>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        )}
      </Slot>
    </PlaceFrame>
  );
});
