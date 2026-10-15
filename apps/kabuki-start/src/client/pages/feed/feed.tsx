import { Route, Router } from '@kestack/kabuki/routing';
import { Pages, Routes } from '../../../shared/index.ts';
import { Loaded, PlaceFrame } from '../../components/index.ts';

/*
 * A long feed that scrolls the window, a client page: the server sends it
 * loading and the browser loads it. It marks no Scroll area: the window is
 * the deepest Place's, so it is this page's. Open a post and press Back:
 * the feed shows its copy at once, and the window goes back once it is
 * drawn. Reload the tab: the same, from the tab's session storage.
 */

export const FeedView = Route.view(Pages.Feed, ({ props }) => (
  <PlaceFrame
    place="Feed"
    status={props.status}
    title="Feed"
    intro="Sixty posts down the window. Scroll far, open one, press Back. Or reload the tab: the window still comes back to where you were."
  >
    <Loaded
      status={props.status}
      label="Loading the feed in the browser… (0.9 s)"
      lines={12}
    >
      {(feed) => (
        <ol className="grid gap-3 sm:grid-cols-2">
          {feed.items.map((item) => (
            <li key={item.id}>
              <Router.Link
                to={Routes.Blog.Post({ slug: item.slug })}
                className="flex h-full flex-col gap-1.5 rounded-lg border border-border bg-background/60 p-4 transition-colors hover:bg-muted/50 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
              >
                <span className="flex items-center justify-between font-mono text-[11px] text-muted-foreground tabular-nums">
                  <span>#{item.id + 1}</span>
                  <span>{item.minutes} min</span>
                </span>
                <span className="font-medium">{item.title}</span>
                <span className="text-sm text-pretty text-muted-foreground">
                  {item.summary}
                </span>
              </Router.Link>
            </li>
          ))}
        </ol>
      )}
    </Loaded>
  </PlaceFrame>
));
