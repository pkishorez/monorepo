import { blog } from 'collections/server';

export interface BlogPostMeta {
  slug: string;
  title: string;
  description?: string;
  path: string;
}

/**
 * Serializable blog metadata for a fully static deployment: prerendered to
 * `/api/blog` and fetched by the blog route loaders on client-side navigation.
 */
export function loadBlogData(): { posts: BlogPostMeta[] } {
  return {
    posts: blog.map((post) => ({
      slug: post.info.path.replace(/\.mdx?$/, ''),
      title: post.title,
      description: post.description,
      path: post.info.path,
    })),
  };
}
