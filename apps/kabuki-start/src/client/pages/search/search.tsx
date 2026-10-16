import { View } from '@kestack/kabuki/react';
import { Router } from '@kestack/kabuki/routing';
import { Button } from '@kestack/web-platform/components/button';
import { Input } from '@kestack/web-platform/components/input';
import { Pages, router } from '../../../shared/index.ts';
import { Loaded, PlaceFrame, row } from '../../components/index.ts';

/*
 * A search box whose query is the URL's. What is typed is the page's own
 * Model, so the box never waits; each keystroke replaces the entry, and the
 * results load again behind the ones shown. Reload loads them again too,
 * and the page, with what is typed, stays.
 */

export const SearchView = View.make(
  Pages.SearchLive,
  ({ props, model, send }) => (
    <PlaceFrame
      place="Search"
      title="Search"
      status={props.status}
      intro="Its Loader reads ?q=: type and the results load again, the old ones shown meanwhile. Reload keeps what you typed."
    >
      <div className="flex max-w-md gap-2">
        <Input
          aria-label="Search the posts"
          placeholder="Search the posts"
          className="h-9 text-base sm:text-sm"
          value={model.typed ?? props.query.q ?? ''}
          onChange={(event) =>
            send({ _tag: 'Typed', text: event.target.value })
          }
        />
        <Button variant="outline" onClick={() => send({ _tag: 'Reloaded' })}>
          Reload
        </Button>
      </div>
      <Loaded status={props.status} label="Searching… (0.6 s)">
        {(found) => (
          <ul>
            {found.hits.map((hit) => (
              <li key={hit.slug}>
                <Router.Link
                  to={router.Blog.Post({ slug: hit.slug })}
                  className={row}
                >
                  {hit.title}
                </Router.Link>
              </li>
            ))}
          </ul>
        )}
      </Loaded>
    </PlaceFrame>
  ),
);
