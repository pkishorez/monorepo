import { Back, Layout } from '@/components/layout';
import { createFileRoute, Link } from '@tanstack/react-router';
import { allEffectPosts } from 'content-collections';

export const Route = createFileRoute('/blog/')({
  component: BlogIndex,
});

function BlogIndex() {
  // Sort posts by createdAt descending (newest first)
  const posts = [...allEffectPosts].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  return (
    <Layout left={<Back to="/" />}>
      <div className="pt-8 pb-10 px-4 max-w-2xl mx-auto">
        <div className="space-y-6">
          <h1 className="text-4xl font-bold text-foreground/90">Blog</h1>

          <div className="flex flex-col gap-2">
            {posts.map((post) => (
              <Link key={post.slug} to={`/blog/${post.slug}` as any}>
                <div className="border border-border/40 rounded-lg p-4 hover:border-border/60 hover:bg-accent/30 transition-all group">
                  <div className="space-y-2">
                    <div className="text-base font-medium group-hover:text-primary transition-colors">
                      {post.title}
                    </div>
                    <div className="text-sm text-muted-foreground">
                      {post.summary}
                    </div>
                    <div className="text-xs text-muted-foreground/70">
                      {formatDate(post.createdAt)}
                    </div>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </Layout>
  );
}
