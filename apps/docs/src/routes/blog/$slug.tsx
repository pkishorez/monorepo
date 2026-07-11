import { createFileRoute, Link, notFound } from '@tanstack/react-router';
import { HomeLayout } from 'fumadocs-ui/layouts/home';
import browserCollections from 'collections/browser';
import { Suspense } from 'react';
import { baseOptions } from '@/lib/layout.shared';
import { getBlogData } from '@/lib/blog-data';
import { HomeHeader } from '@/components/home-header';
import { useMDXComponents } from '@/components/mdx';

export const Route = createFileRoute('/blog/$slug')({
  component: Page,
  loader: async ({ params }) => {
    const { posts } = await getBlogData();
    const post = posts.find((p) => p.slug === params.slug);
    if (!post) throw notFound();

    await clientLoader.preload(post.path);
    return { post };
  },
});

const clientLoader = browserCollections.blog.createClientLoader({
  component({ frontmatter, default: MDX }) {
    return (
      <article className="prose">
        <h1>{frontmatter.title}</h1>
        <p className="text-lg text-muted-foreground">
          {frontmatter.description}
        </p>
        <MDX components={useMDXComponents()} />
      </article>
    );
  },
});

function Page() {
  const { post } = Route.useLoaderData();

  return (
    <HomeLayout {...baseOptions()} slots={{ header: HomeHeader }}>
      <main className="mx-auto w-full max-w-2xl flex-1 px-6 py-16">
        <Link
          to="/blog"
          className="text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          ← Blog
        </Link>
        <div className="mt-6">
          <Suspense>{clientLoader.useContent(post.path)}</Suspense>
        </div>
      </main>
    </HomeLayout>
  );
}
