import { Route, Router } from '@kestack/kabuki/routing';
import { Pages, Routes } from '../../../shared/index.ts';
import { Loaded, PlaceFrame, link, pane } from '../../components/index.ts';

/*
 * One post, drawn inside the blog, which stays as it is while it loads.
 * From the `lg` width its article scrolls on its own, below it the window
 * does. It is named for its post, `data-scroll-restoration-id`, so the post
 * going out and the one coming in, side by side while they animate, are
 * never taken for each other: a new post opens at its top, and Back finds
 * the one before where it was read to. Each part has an id, for a link to
 * it: `/blog/scroll-entry#part-5`.
 */

export const PostView = Route.view(Pages.Post, ({ props }) => {
  return (
    <PlaceFrame place="Blog.Post" status={props.status} fill>
      <div
        data-scroll-restoration-id={`post:${props.params.slug}`}
        className={`${pane} -mr-2 pr-2`}
      >
        <Loaded
          status={props.status}
          label={`Loading /blog/${props.params.slug}… (a second)`}
          lines={10}
        >
          {(post) => (
            <article className="max-w-prose space-y-5">
              <header className="space-y-2">
                <p className="font-mono text-xs text-muted-foreground">
                  {post.date}
                </p>
                <h1 className="text-2xl font-semibold tracking-tight text-balance sm:text-3xl">
                  {post.title}
                </h1>
                <p className="text-pretty text-muted-foreground">
                  {post.summary}
                </p>
              </header>
              <nav
                aria-label="On this page"
                className="flex flex-wrap gap-x-3 gap-y-1 font-mono text-xs text-muted-foreground"
              >
                {post.body.map((_, at) => (
                  <a key={at} href={`#part-${at + 1}`} className={link}>
                    part {at + 1}
                  </a>
                ))}
              </nav>
              <div className="space-y-6 text-[0.9375rem] leading-7">
                {post.body.map((paragraph, at) => (
                  <section key={at} id={`part-${at + 1}`} className="space-y-2">
                    <h2 className="font-mono text-xs text-muted-foreground">
                      part {at + 1}
                    </h2>
                    <p>{paragraph}</p>
                  </section>
                ))}
              </div>
              <p className="border-t border-border pt-4 text-sm text-muted-foreground">
                At the end. Open{' '}
                <Router.Link
                  to={Routes.Blog.Post({
                    slug:
                      post.slug === 'back-is-free'
                        ? 'pages-are-actors'
                        : 'back-is-free',
                  })}
                  className={link}
                >
                  another post
                </Router.Link>
                : it starts at its top. Back brings you here again.
              </p>
            </article>
          )}
        </Loaded>
      </div>
    </PlaceFrame>
  );
});
