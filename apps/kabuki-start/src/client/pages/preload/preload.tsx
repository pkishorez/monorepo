import { View } from '@kestack/kabuki/react';
import { Route, Router } from '@kestack/kabuki/routing';
import type { Preload } from '@kestack/kabuki/routing';
import { Pages, Routes } from '../../../shared/index.ts';
import { PageFrame, enter } from '../../components/index.ts';

/*
 * Links to slow pages, one row per way a link preloads. Each preload is one
 * Message to the Router: the devtools' Timeline shows them. A slow page's
 * View is lazy, so its code loads with its data.
 */

const SlowView = Route.view(
  Pages.Slow,
  View.lazy(() => import('./slow.tsx')),
);

const ROWS: ReadonlyArray<{
  readonly mode: Preload;
  readonly title: string;
  readonly what: string;
  readonly pages: ReadonlyArray<number>;
}> = [
  {
    mode: 'intent',
    title: 'On hover or focus',
    what: 'the default: rest on a link for 50 ms, then click',
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

const chip =
  'grid size-11 place-items-center rounded-lg border border-border font-mono text-sm transition-colors hover:bg-muted';

export const PreloadView = Route.view(Pages.Preload, (self) => {
  const slow = self.children.Slow;
  if (slow)
    return (
      <div key={slow.id} className={enter}>
        <SlowView instance={slow} />
      </div>
    );
  return (
    <PageFrame
      place="Preload"
      title="Preload"
      intro="Every link below goes to a page whose Loader takes a second and a half. A link that preloads warms the Data cache, so the page is there when it is clicked; a click during a preload joins it."
    >
      {ROWS.map(({ mode, title, what, pages }) => (
        <section key={String(mode)} className="space-y-2">
          <h2 className="font-medium">
            {title}{' '}
            <code className="font-mono text-xs text-muted-foreground">
              preload={JSON.stringify(mode)}
            </code>
          </h2>
          <p className="text-sm text-muted-foreground">{what}</p>
          <ul className="flex gap-2">
            {pages.map((n) => (
              <li key={n}>
                <Router.Link
                  to={Routes.Preload.Slow({ n })}
                  preload={mode}
                  className={chip}
                >
                  {n}
                </Router.Link>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </PageFrame>
  );
});
