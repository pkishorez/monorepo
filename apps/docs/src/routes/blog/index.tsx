import { createFileRoute, Link } from '@tanstack/react-router';
import { HomeLayout } from 'fumadocs-ui/layouts/home';
import { baseOptions } from '@/lib/layout.shared';
import { getBlogData } from '@/lib/blog-data';
import { HomeHeader } from '@/components/home-header';

export const Route = createFileRoute('/blog/')({
  component: BlogIndex,
  loader: () => getBlogData(),
});

function BlogIndex() {
  const { posts } = Route.useLoaderData();

  return (
    <HomeLayout {...baseOptions()} slots={{ header: HomeHeader }}>
      <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-10 px-6 py-16">
        <section className="space-y-1">
          <h1 className="text-4xl font-semibold tracking-tight">Blog</h1>
          <p className="text-lg text-muted-foreground">
            Notes on the packages in this monorepo.
          </p>
        </section>

        <section className="flex flex-col gap-2">
          {posts.map((post) => (
            <Link
              key={post.slug}
              to="/blog/$slug"
              params={{ slug: post.slug }}
              className="group -mx-3 block rounded-md px-3 py-2 transition-colors hover:bg-muted/50"
            >
              <span className="underline decoration-muted-foreground/40 underline-offset-4 transition-colors group-hover:decoration-foreground">
                {post.title}
              </span>
              {post.description && (
                <p className="mt-1 text-sm text-muted-foreground transition-colors group-hover:text-foreground/70">
                  {post.description}
                </p>
              )}
            </Link>
          ))}
        </section>
      </main>
    </HomeLayout>
  );
}
