import { View } from '@kestack/kabuki/react';
import { Router } from '@kestack/kabuki/routing';
import { Pages, router } from '../../../shared/index.ts';
import { Loaded, PlaceFrame } from '../../components/index.ts';

/*
 * A long feed that scrolls the window, a client page: the server sends it
 * loading and the browser loads it. Nothing on it says anything of scroll:
 * the Router keeps the window per entry. Open a post and press Back: the
 * feed shows its copy at once, and the window goes back. A reload draws it
 * loading first, too short to go back to, as in TanStack Start.
 */

export const FeedView = View.make(Pages.FeedLive, ({ props }) => (
  <PlaceFrame
    place="Feed"
    status={props.status}
    title="Feed"
    intro="Sixty posts down the window. Scroll far, open one, press Back: the window comes back to where you were."
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
                to={router.Blog.Post({ slug: item.slug })}
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
