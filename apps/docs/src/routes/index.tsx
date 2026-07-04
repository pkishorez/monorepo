import { createFileRoute, Link } from '@tanstack/react-router';
import { HomeLayout } from 'fumadocs-ui/layouts/home';
import { appName } from '@/lib/shared';
import { baseOptions } from '@/lib/layout.shared';
import { StatusBadge } from '@/components/status-badge';

const packages = [
  {
    name: 'std-toolkit',
    description: 'Database-agnostic sync over single-table item collections.',
    slug: 'std-toolkit',
    status: 'alpha',
  },
] as const;

export const Route = createFileRoute('/')({
  component: Home,
});

function Home() {
  return (
    <HomeLayout {...baseOptions()}>
      <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col justify-center gap-10 px-6 py-16">
        <section className="space-y-1">
          <div className="flex items-center gap-3">
            <img
              src="/favicon.svg"
              alt=""
              width={36}
              height={36}
              className="size-9 rounded-lg"
            />
            <h1 className="text-4xl font-semibold tracking-tight">{appName}</h1>
          </div>
          <p className="text-lg text-muted-foreground">
            Everything I build, in one monorepo.
          </p>
        </section>

        <section className="flex flex-col gap-2">
          {packages.map((pkg) => (
            <Link
              key={pkg.name}
              to="/docs/$"
              params={{ _splat: pkg.slug }}
              className="group -mx-3 block rounded-md px-3 py-2 transition-colors hover:bg-muted/50"
            >
              <span className="inline-flex items-center gap-2">
                <span className="underline decoration-muted-foreground/40 underline-offset-4 transition-colors group-hover:decoration-foreground">
                  {pkg.name}
                </span>
                <StatusBadge status={pkg.status} />
              </span>
              <p className="mt-1 text-sm text-muted-foreground transition-colors group-hover:text-foreground/70">
                {pkg.description}
              </p>
            </Link>
          ))}
        </section>
      </main>
    </HomeLayout>
  );
}
