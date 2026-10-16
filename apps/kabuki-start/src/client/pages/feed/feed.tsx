import { View } from '@kestack/kabuki/react';
import { Router } from '@kestack/kabuki/routing';
import { Pages, router } from '../../../shared/index.ts';
import { Loaded, PlaceFrame, row } from '../../components/index.ts';

/*
 * A long feed that scrolls the window, a client page: the server sends it
 * loading and the browser loads it. Nothing on it says anything of scroll:
 * the Router keeps the window per entry.
 */

export const FeedView = View.make(Pages.FeedLive, ({ props }) => (
  <PlaceFrame
    place="Feed"
    title="Feed"
    status={props.status}
    intro="Scroll far, open a post, press Back: the window comes back to where you were."
  >
    <Loaded
      status={props.status}
      label="Loading the feed in the browser… (0.9 s)"
      lines={12}
    >
      {(feed) => (
        <ol>
          {feed.items.map((item) => (
            <li key={item.id}>
              <Router.Link
                to={router.Blog.Post({ slug: item.slug })}
                className={row}
              >
                <span className="w-6 font-mono text-[11px] text-muted-foreground tabular-nums">
                  {item.id + 1}
                </span>
                {item.title}
              </Router.Link>
            </li>
          ))}
        </ol>
      )}
    </Loaded>
  </PlaceFrame>
));
