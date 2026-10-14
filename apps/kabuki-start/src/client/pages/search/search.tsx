import { Route, Router } from '@kestack/kabuki/routing';
import { Input } from '@kestack/web-platform/components/input';
import { Pages, Routes } from '../../../shared/index.ts';
import { Loaded, PageFrame, Refreshing, link } from '../../components/index.ts';

/*
 * A search box whose query is the URL's. What is typed is the page's own
 * Model, so the box never waits; each keystroke replaces the entry, and the
 * results load again behind the ones shown.
 */

export const SearchView = Route.view(Pages.Search, ({ props, model, send }) => (
  <PageFrame
    place="Search"
    {...(props.status._tag === 'Ready' ? { data: props.status.data } : {})}
    title="Search"
    intro="Its Loader reads ?q=. A new query is the same page, loading again: the results shown stay, marked, until the new ones come. Back skips the keystrokes."
  >
    <Input
      aria-label="Search the posts"
      placeholder="Search the posts"
      className="max-w-md"
      value={model.typed ?? props.query.q ?? ''}
      onChange={(event) => send({ _tag: 'Typed', text: event.target.value })}
    />
    <Loaded status={props.status} label="Searching…">
      {(results, refreshing) => (
        <section className="space-y-3" aria-busy={refreshing}>
          <p className="flex items-center gap-3 text-sm text-muted-foreground">
            {results.hits.length} {results.hits.length === 1 ? 'post' : 'posts'}
            {results.q && ` for “${results.q}”`}
            <Refreshing on={refreshing} />
          </p>
          <ul
            className={`space-y-2 transition-opacity ${refreshing ? 'opacity-60' : ''}`}
          >
            {results.hits.map((hit) => (
              <li key={hit.slug}>
                <Router.Link
                  to={Routes.Blog.Post({ slug: hit.slug })}
                  className={link}
                >
                  {hit.title}
                </Router.Link>
                <span className="text-sm text-muted-foreground">
                  {' '}
                  · {hit.summary}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </Loaded>
  </PageFrame>
));
