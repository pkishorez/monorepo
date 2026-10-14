import { Router } from '@kestack/kabuki/routing';
import { Routes } from '../../../../shared/index.ts';
import { PageFrame, link } from '../../../components/index.ts';

/*
 * One post, the one the URL names: static, drawn once per deploy, its
 * Loader run at the same time as the blog's.
 */

type PostInput = typeof Routes.Blog.Post.input.Type;

export const Post = (_props: unknown, post: PostInput) => (
  <PageFrame
    place="Blog.Post"
    loadedAt={post.loadedAt}
    title={post.title}
    intro={post.summary}
  >
    <article className="max-w-prose space-y-4 text-[0.9375rem] leading-7">
      <p className="font-mono text-xs text-muted-foreground">{post.date}</p>
      {post.body.map((paragraph) => (
        <p key={paragraph}>{paragraph}</p>
      ))}
    </article>
    <Router.Link to={Routes.Blog.Index()} className={`${link} text-sm`}>
      All posts
    </Router.Link>
  </PageFrame>
);
