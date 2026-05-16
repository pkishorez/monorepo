import { createFileRoute, Link } from '@tanstack/react-router';

import { Back, Layout } from '@/components/layout';
import { docsByCollection } from '@/docs/registry';

export const Route = createFileRoute('/docs/')({
  component: DocsIndex,
  loader: () => ({ groups: docsByCollection() }),
});

function DocsIndex() {
  const { groups } = Route.useLoaderData();

  return (
    <Layout left={<Back to="/" />}>
      <div className="pt-8 pb-10 px-4 max-w-2xl mx-auto">
        <div className="space-y-8">
          <div className="space-y-2">
            <h1 className="text-4xl font-bold text-foreground/90">Docs</h1>
            <p className="text-muted-foreground text-sm">
              Generated documentation across monorepo packages.
            </p>
          </div>

          {groups.map(({ collection, entries }) => (
            <section key={collection} className="space-y-3">
              <h2 className="text-muted-foreground font-mono text-[11px] font-semibold tracking-wider uppercase">
                {collection}
              </h2>
              <div className="flex flex-col gap-2">
                {entries.map((entry) => (
                  <Link
                    key={entry.slug}
                    to="/docs/$pkg"
                    params={{ pkg: entry.slug }}
                  >
                    <div className="border border-border/40 rounded-lg p-4 hover:border-border/60 hover:bg-accent/30 transition-all group">
                      <div className="space-y-1">
                        <div className="text-base font-medium group-hover:text-primary transition-colors">
                          {entry.title}
                        </div>
                        <div className="text-muted-foreground text-xs font-mono">
                          {entry.report.package.name}
                        </div>
                        {entry.report.package.description && (
                          <div className="text-sm text-muted-foreground pt-1">
                            {entry.report.package.description}
                          </div>
                        )}
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            </section>
          ))}
        </div>
      </div>
    </Layout>
  );
}
