import { Route, Router } from '@kestack/kabuki/routing';
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@kestack/web-platform/components/card';
import { Pages, Routes } from '../../../shared/index.ts';
import {
  Loaded,
  PageFrame,
  enter,
  link,
  tile,
} from '../../components/index.ts';
import { PostView } from './post.tsx';

/*
 * The blog: its list of posts, or the post the URL names beside the list.
 * The post is the blog's Child, there while the URL names it, and loads on
 * its own: the blog stays as it is.
 */

export const BlogView = Route.view(Pages.Blog, (self) => {
  const post = self.children.Post;
  const { status } = self.props;
  // A post open: the blog stays beside it, its list as it was.
  if (post)
    return (
      <div className="grid gap-10 lg:grid-cols-[14rem_1fr]">
        <nav aria-label="Posts" className="space-y-2 text-sm">
          <p className="font-mono text-xs text-muted-foreground">Blog</p>
          {status._tag === 'Ready' ? (
            <ul className="space-y-1">
              {status.data.posts.map((each) => (
                <li key={each.slug}>
                  <Router.Link
                    to={Routes.Blog.Post({ slug: each.slug })}
                    aria-current={
                      self.props.route.page?.slug === each.slug
                        ? 'page'
                        : undefined
                    }
                    className="block rounded-md px-2 py-1 text-muted-foreground hover:bg-muted hover:text-foreground aria-[current=page]:bg-muted aria-[current=page]:text-foreground"
                  >
                    {each.title}
                  </Router.Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-muted-foreground">Loading the list…</p>
          )}
          <Router.Link to={Routes.Blog()} className={link}>
            All posts
          </Router.Link>
        </nav>
        <div key={post.id} className={enter}>
          <PostView instance={post} />
        </div>
      </div>
    );
  return (
    <Loaded status={status} label="Loading the blog…">
      {(list) => (
        <PageFrame
          place="Blog"
          data={list}
          title="Blog"
          intro="The list is the blog's own data. Open a post: the blog stays beside it, and only the post loads. Press Back: no request, the copy is static."
        >
          <ul className="grid max-w-2xl gap-3">
            {list.posts.map((each) => (
              <li key={each.slug}>
                <Router.Link
                  to={Routes.Blog.Post({ slug: each.slug })}
                  className={tile}
                >
                  <Card size="sm">
                    <CardHeader>
                      <p className="font-mono text-xs text-muted-foreground">
                        {each.date}
                      </p>
                      <CardTitle>{each.title}</CardTitle>
                      <CardDescription>{each.summary}</CardDescription>
                    </CardHeader>
                  </Card>
                </Router.Link>
              </li>
            ))}
          </ul>
          <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-muted-foreground">
            <Router.Link
              to={Routes.Blog.Post({ slug: 'broken' })}
              className={link}
            >
              A post whose Loader breaks
            </Router.Link>
            <Router.Link
              to={Routes.Blog.Post({ slug: 'missing' })}
              className={link}
            >
              A post that is not there
            </Router.Link>
            <Router.Link
              to={Routes.Blog.Post({ slug: 'moved' })}
              className={link}
            >
              A post that moved
            </Router.Link>
          </div>
        </PageFrame>
      )}
    </Loaded>
  );
});
