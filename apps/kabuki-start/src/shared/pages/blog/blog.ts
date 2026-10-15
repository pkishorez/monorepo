import { Route } from '@kestack/kabuki/routing';
import { Post } from './post.ts';
import { about, PostList } from '../../data/index.ts';

/*
 * The blog: the list of posts, and the post the URL names under it. Both
 * are static. Opening a post keeps the blog: only the post loads. The list
 * says `scroll: 'url'`: however the app comes back to the blog, a link or
 * Back, the list is where it was. Its post says `entry` for itself.
 */

export const Blog = Route.page({
  path: '/blog',
  data: PostList,
  scroll: 'url',
  metadata: about('/blog', 'Blog', 'Notes on pages as Actors.'),
  pages: { Post },
}).build({});
