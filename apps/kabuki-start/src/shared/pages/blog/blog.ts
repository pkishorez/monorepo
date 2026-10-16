import { Page } from '@kestack/kabuki/routing';
import { Post, PostLive } from './post.ts';
import { about, PostList } from '../../data/index.ts';

/*
 * The blog: the list of posts, and the post the URL names under it. Both
 * are static. Opening a post keeps the blog: only the post loads.
 */

export const Blog = Page.define({
  path: '/blog',
  data: PostList,
  metadata: about('/blog', 'Blog', 'Notes on pages as Actors.'),
  pages: { Post },
});

export const BlogLive = Page.build(Blog, { pages: { Post: PostLive } });
