import { Route } from '@kestack/kabuki/routing';
import { Pages } from '../../../shared/index.ts';
import { Loaded, PageFrame } from '../../components/index.ts';

/*
 * One post: its loading screen, why it failed, or the post. It is drawn
 * inside the blog, which stays as it is while the post loads.
 */

export const PostView = Route.view(Pages.Post, ({ props }) => (
  <Loaded status={props.status} label={`Loading /blog/${props.params.slug}…`}>
    {(post) => (
      <PageFrame
        place="Blog.Post"
        data={post}
        title={post.title}
        intro={post.summary}
      >
        <article className="max-w-prose space-y-4 text-[0.9375rem] leading-7">
          <p className="font-mono text-xs text-muted-foreground">{post.date}</p>
          {post.body.map((paragraph) => (
            <p key={paragraph}>{paragraph}</p>
          ))}
        </article>
      </PageFrame>
    )}
  </Loaded>
));
