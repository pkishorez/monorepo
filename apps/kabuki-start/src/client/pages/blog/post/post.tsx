import { Actor } from '@kestack/kabuki';
import { View } from '@kestack/kabuki/react';
import { Router } from '@kestack/kabuki/routing';
import { Routes } from '../../../../shared/index.ts';
import { PageFrame, Skeleton, link } from '../../../components/index.ts';

/*
 * One post, the one the URL names: static, drawn once per deploy. Its
 * Loader takes a second, so a move to it shows its pending screen inside
 * the blog. It has no failed screen of its own: a post that breaks shows
 * the app's.
 */

const PostActor = Actor.make('Post', {
  input: Routes.Blog.Post.input,
  props: Routes.Blog.Post.props,
  model: Routes.Blog.Post.input,
}).build({ init: (post) => ({ model: post }) });

const PostView = View.make(PostActor, (self) => {
  const post = self.model;
  return (
    <div {...self.root}>
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
    </div>
  );
});

export const Post = {
  actor: PostActor,
  view: PostView,
  pending: ({ slug }: { readonly slug: string }) => (
    <Skeleton label={`Loading /blog/${slug}…`} />
  ),
};
