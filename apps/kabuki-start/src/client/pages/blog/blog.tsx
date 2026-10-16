import { View } from '@kestack/kabuki/react';
import { Router } from '@kestack/kabuki/routing';
import { Pages, router } from '../../../shared/index.ts';
import {
  Loaded,
  PlaceFrame,
  list,
  panes,
  row,
} from '../../components/index.ts';
import { PostView } from './post.tsx';

/*
 * The blog: its list of posts, and the post the URL names beside it. The
 * post is the blog's Child and loads on its own: the blog stays as it is.
 * Its links say `resetScroll` false, so the list keeps its scroll as a
 * post opens; the list is named, `data-scroll-restoration-id`, so Back
 * finds it where it was.
 */

export const BlogView = View.make(Pages.BlogLive, (self) => {
  const post = self.children.Post;
  const open = self.props.route.page?.slug;
  return (
    <PlaceFrame
      place="Blog"
      title="Blog"
      status={self.props.status}
      intro="Scroll the list and a post, open another, press Back: each scroll comes back."
    >
      <div
        className={`grid gap-3 ${panes} lg:grid-cols-[minmax(0,18rem)_minmax(0,1fr)]`}
      >
        <nav
          aria-label="Posts"
          data-scroll-restoration-id="posts"
          className={list}
        >
          <Loaded status={self.props.status} label="Loading the list…">
            {(data) => (
              <ul>
                {data.posts.map((each) => (
                  <li key={each.slug}>
                    <Router.Link
                      to={router.Blog.Post({ slug: each.slug })}
                      resetScroll={false}
                      aria-current={open === each.slug ? 'page' : undefined}
                      className={row}
                    >
                      <span className="truncate">{each.title}</span>
                    </Router.Link>
                  </li>
                ))}
              </ul>
            )}
          </Loaded>
        </nav>
        {post ? (
          <PostView instance={post} />
        ) : (
          <p className="grid min-h-40 place-items-center rounded-lg border border-dashed border-border text-sm text-muted-foreground">
            Pick a post.
          </p>
        )}
      </div>
    </PlaceFrame>
  );
});
