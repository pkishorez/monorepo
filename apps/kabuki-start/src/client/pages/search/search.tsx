import { Route, Router, useScroll } from '@kestack/kabuki/routing';
import { Input } from '@kestack/web-platform/components/input';
import { Pages, Routes } from '../../../shared/index.ts';
import { Loaded, PlaceFrame, pane, row } from '../../components/index.ts';

/*
 * A search box whose query is the URL's. What is typed is the page's own
 * Model, so the box never waits; each keystroke replaces the entry, and the
 * results load again behind the ones shown. The results are its Scroll
 * area, `url`, which counts the query: each search keeps its own place.
 */

export const SearchView = Route.view(Pages.Search, ({ props, model, send }) => {
  const results = useScroll();
  return (
    <PlaceFrame
      place="Search"
      status={props.status}
      title="Search"
      intro="Its Loader reads ?q=. A new query is the same page, loading again: the results shown stay, dimmed, until the new ones come. Back skips the keystrokes."
    >
      <Input
        aria-label="Search the posts"
        placeholder="Search the posts"
        className="h-11 max-w-md text-base sm:h-9 sm:text-sm"
        value={model.typed ?? props.query.q ?? ''}
        onChange={(event) => send({ _tag: 'Typed', text: event.target.value })}
      />
      <div ref={results} className={`${pane} -mr-2 pr-2`}>
        <Loaded status={props.status} label="Searching… (0.6 s)" lines={6}>
          {(found) => (
            <section className="space-y-2">
              <p className="text-sm text-muted-foreground">
                {found.hits.length} {found.hits.length === 1 ? 'post' : 'posts'}
                {found.q && ` for “${found.q}”`}
              </p>
              <ul className="-mx-3">
                {found.hits.map((hit) => (
                  <li key={hit.slug}>
                    <Router.Link
                      to={Routes.Blog.Post({ slug: hit.slug })}
                      className={`${row} flex-col items-start gap-0.5`}
                    >
                      <span className="font-medium">{hit.title}</span>
                      <span className="text-muted-foreground">
                        {hit.summary}
                      </span>
                    </Router.Link>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </Loaded>
      </div>
    </PlaceFrame>
  );
});
