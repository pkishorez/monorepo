import { blog } from 'collections/server';

export interface BlogPostMeta {
  slug: string;
  title: string;
  description?: string;
  path: string;
}

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
