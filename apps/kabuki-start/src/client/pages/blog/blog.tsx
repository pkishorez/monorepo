import { motion } from 'motion/react';
import { Route, Router } from '@kestack/kabuki/routing';
import { Pages, Routes } from '../../../shared/index.ts';
import {
  Loaded,
  PlaceFrame,
  Slot,
  link,
  quick,
  panes,
  row,
} from '../../components/index.ts';
import { PostView } from './post.tsx';

/*
 * The blog: its list of posts, and the post the URL names beside it. The
 * post is the blog's Child, there while the URL names it, and loads on its
 * own: the blog, and its list, stay as they are. The list stays on the page
 * as a post opens, so its scroll is kept; its links say `resetScroll`
 * false, so on a phone, where the post below it scrolls the window, the
 * window stays too. It is named, `data-scroll-restoration-id`: as a page
 * slides out, the one before still beside it, its place in the document
 * is not where it was kept.
 */

export const BlogView = Route.view(Pages.Blog, (self) => {
  const post = self.children.Post;
  const open = self.props.route.page?.slug;
  return (
    <PlaceFrame
      place="Blog"
      status={self.props.status}
      intro="Scroll the list and a post, open another, then press Back: the post returns where you read to, and the list never moved. Nothing on these pages says how: the Router keeps every scroll per entry."
    >
      <div
        className={`grid gap-4 ${panes} lg:grid-cols-[minmax(0,19rem)_minmax(0,1fr)]`}
      >
        <nav
          aria-label="Posts"
          data-scroll-restoration-id="posts"
          className="max-h-80 overflow-y-auto overscroll-contain rounded-lg border border-border bg-background/60 p-1.5 lg:h-full lg:max-h-none"
        >
          <Loaded
            status={self.props.status}
            label="Loading the list…"
            lines={8}
          >
            {(data) => (
              <>
                <ul>
                  {data.posts.map((each, at) => (
                    <li key={each.slug}>
                      <Router.Link
                        to={Routes.Blog.Post({ slug: each.slug })}
                        resetScroll={false}
                        aria-current={open === each.slug ? 'page' : undefined}
                        className={`${row} aria-[current=page]:font-medium`}
                      >
                        {open === each.slug && (
                          <motion.span
                            layoutId="blog-current"
                            transition={quick}
                            className="absolute inset-0 -z-10 rounded-lg bg-muted"
                          />
                        )}
                        <span className="w-5 shrink-0 font-mono text-[11px] text-muted-foreground tabular-nums">
                          {String(at + 1).padStart(2, '0')}
                        </span>
                        <span className="min-w-0 truncate">{each.title}</span>
                      </Router.Link>
                    </li>
                  ))}
                </ul>
                <div className="mt-2 space-y-1 border-t border-border px-3 pt-3 pb-2 text-xs text-muted-foreground">
                  <p className="font-mono">When it goes wrong</p>
                  <p className="flex flex-wrap gap-x-4 gap-y-1">
                    <Router.Link
                      to={Routes.Blog.Post({ slug: 'broken' })}
                      className={link}
                    >
                      breaks
                    </Router.Link>
                    <Router.Link
                      to={Routes.Blog.Post({ slug: 'missing' })}
                      className={link}
                    >
                      not found
                    </Router.Link>
                    <Router.Link
                      to={Routes.Blog.Post({ slug: 'moved' })}
                      className={link}
                    >
                      moved
                    </Router.Link>
                  </p>
                </div>
              </>
            )}
          </Loaded>
        </nav>
        <Slot className="lg:h-full" id={post?.id ?? 'none'}>
          {post ? (
            <PostView instance={post} />
          ) : (
            <div className="grid min-h-48 place-items-center rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground lg:h-full">
              Pick a post. Only the post loads: the blog stays as it is.
            </div>
          )}
        </Slot>
      </div>
    </PlaceFrame>
  );
});
