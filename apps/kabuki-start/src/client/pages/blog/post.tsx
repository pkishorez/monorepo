import { Route, Router, useScroll } from '@kestack/kabuki/routing';
import { Pages, Routes } from '../../../shared/index.ts';
import { Loaded, PlaceFrame, link, pane } from '../../components/index.ts';

/*
 * One post, drawn inside the blog, which stays as it is while it loads.
 * Its article is its Scroll area: from the `lg` width it scrolls on its
 * own, and below it the window does, so a phone puts the window back.
 */

export const PostView = Route.view(Pages.Post, ({ props }) => {
  const article = useScroll();
  return (
    <PlaceFrame place="Blog.Post" status={props.status} fill>
      <div ref={article} className={`${pane} -mr-2 pr-2`}>
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
              <div className="space-y-4 text-[0.9375rem] leading-7">
                {post.body.map((paragraph, at) => (
                  <p key={at}>{paragraph}</p>
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
