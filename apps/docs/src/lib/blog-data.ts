import { createIsomorphicFn } from '@tanstack/react-start';
import type { BlogPostMeta } from './blog';

/**
 * Resolves blog metadata isomorphically: directly from the source at prerender
 * time on the server, and from the prerendered `/api/blog` JSON on client-side
 * navigation. Keeps the deployment fully static.
 */
export const getBlogData = createIsomorphicFn()
  .server(async (): Promise<{ posts: BlogPostMeta[] }> => {
    const { loadBlogData } = await import('./blog');
    return loadBlogData();
  })
  .client(
    async (): Promise<{ posts: BlogPostMeta[] }> =>
      (await fetch('/api/blog')).json(),
  );
