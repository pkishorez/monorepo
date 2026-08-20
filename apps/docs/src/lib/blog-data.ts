import { createIsomorphicFn } from '@tanstack/react-start';
import type { BlogPostMeta } from './blog';

export const getBlogData = createIsomorphicFn()
  .server(async (): Promise<{ posts: BlogPostMeta[] }> => {
    const { loadBlogData } = await import('./blog');
    return loadBlogData();
  })
  .client(async (): Promise<{ posts: BlogPostMeta[] }> =>
    (await fetch('/api/blog')).json(),
  );
