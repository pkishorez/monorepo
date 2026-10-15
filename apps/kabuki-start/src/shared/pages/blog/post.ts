import { Schema } from 'effect';
import { Route } from '@kestack/kabuki/routing';
import { about, Post as PostData } from '../../data/index.ts';

/*
 * One post, the one the URL names: static, so drawn once per deploy, and
 * its copy in the Data cache is never loaded again. Its Loader takes a
 * second. `broken` always breaks, `missing` is not found, and `moved`
 * Redirects to a post that is there.
 */

export const Post = Route.page({
  path: '/:slug',
  params: { slug: Schema.String },
  data: PostData,
  metadata: ({ slug }, post) =>
    about(`/blog/${slug}`, post?.title ?? 'A post', post?.summary ?? '', {
      type: 'article',
    }),
}).build({});
