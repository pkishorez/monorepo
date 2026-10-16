import { View } from '@kestack/kabuki/react';
import { Router } from '@kestack/kabuki/routing';
import type { Preload } from '@kestack/kabuki/routing';
import { Pages, router } from '../../../shared/index.ts';
import { PlaceFrame, link } from '../../components/index.ts';

/*
 * Links to slow pages, one row per way a link preloads. Each preload is one
 * Message to the Router: the devtools' Timeline shows them. A slow page's
 * View is lazy, so its code loads with its data. It is drawn in place of
 * the links, inside this page's box.
 */

const SlowView = View.lazy(Pages.SlowLive, () => import('./slow.tsx'));

const ROWS: ReadonlyArray<{
  readonly mode: Preload;
  readonly what: string;
  readonly pages: ReadonlyArray<number>;
}> = [
  { mode: 'intent', what: 'on hover or focus', pages: [1, 2, 3] },
  { mode: 'viewport', what: 'once in view', pages: [4, 5, 6] },
  { mode: false, what: 'never: its loading screen shows', pages: [7, 8, 9] },
];

export const PreloadView = View.make(Pages.PreloadLive, (self) => {
  const slow = self.children.Slow;
  return (
    <PlaceFrame
      place="Preload"
      title="Preload and stale time"
      intro="Each page's Loader takes 1.5 s. A preloaded one is there on click. Its data then stays fresh for 30 s: open it, go back, open it again, and its Loader does not run."
    >
      {slow ? (
        <SlowView instance={slow} />
      ) : (
        <ul className="space-y-2 text-sm">
          {ROWS.map(({ mode, what, pages }) => (
            <li key={String(mode)} className="flex items-center gap-3">
              <code className="w-32 font-mono text-xs text-muted-foreground">
                preload={JSON.stringify(mode)}
              </code>
              {pages.map((n) => (
                <Router.Link
                  key={n}
                  to={router.Preload.Slow({ n })}
                  preload={mode}
                  className={`${link} font-mono`}
                >
                  {n}
                </Router.Link>
              ))}
              <span className="text-muted-foreground">{what}</span>
            </li>
          ))}
        </ul>
      )}
    </PlaceFrame>
  );
});
