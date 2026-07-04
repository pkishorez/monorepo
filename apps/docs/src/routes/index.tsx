import { createFileRoute, Link } from '@tanstack/react-router';
import { HomeLayout } from 'fumadocs-ui/layouts/home';
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@monorepo/frontend/components/ui/card';
import { Button } from '@monorepo/frontend/components/ui/button';
import {
  ArrowRight,
  Boxes,
  Database,
  Network,
  Zap,
} from '@monorepo/frontend/lucide';
import { baseOptions } from '@/lib/layout.shared';

const packages = [
  {
    name: 'std-toolkit',
    description:
      'Database-agnostic sync over single-table item collections, with schema evolution and adapters.',
    slug: 'std-toolkit',
    icon: Database,
  },
  {
    name: 'use-effect-ts',
    description: 'React hooks for Effect.TS.',
    slug: 'use-effect-ts',
    icon: Zap,
  },
  {
    name: 'depcruise-viz',
    description:
      'Author your layered architecture as typed config, then enforce its boundaries.',
    slug: 'depcruise-viz',
    icon: Network,
  },
  {
    name: 'devtools',
    description:
      'A local devtools RPC server for inspecting a project’s dependency graph.',
    slug: 'devtools',
    icon: Boxes,
  },
] as const;

export const Route = createFileRoute('/')({
  component: Home,
});

function Home() {
  return (
    <HomeLayout {...baseOptions()}>
      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col justify-center gap-12 px-4 py-16">
        <section className="flex flex-col items-center gap-6 text-center">
          <h1 className="max-w-3xl text-4xl font-semibold tracking-tight text-balance md:text-5xl">
            Single-table design toolkit
          </h1>
          <p className="max-w-2xl text-lg text-muted-foreground text-balance">
            Database-agnostic sync over single-table item collections. Sync only
            needs sorted items — so it works over any database.
          </p>
          <Button
            render={<Link to="/docs/$" params={{ _splat: 'std-toolkit' }} />}
            size="lg"
            data-icon="inline-end"
          >
            Get started
            <ArrowRight />
          </Button>
        </section>

        <section className="grid gap-4 sm:grid-cols-2">
          {packages.map((pkg) => (
            <Link
              key={pkg.name}
              to="/docs/$"
              params={{ _splat: pkg.slug }}
              className="group/link"
            >
              <Card className="h-full transition-colors group-hover/link:ring-foreground/20">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <pkg.icon className="size-4 text-muted-foreground" />
                    {pkg.name}
                  </CardTitle>
                  <CardDescription>{pkg.description}</CardDescription>
                </CardHeader>
              </Card>
            </Link>
          ))}
        </section>
      </main>
    </HomeLayout>
  );
}
