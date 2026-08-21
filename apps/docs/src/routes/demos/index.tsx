import { createFileRoute, Link } from '@tanstack/react-router';
import { HomeLayout } from 'fumadocs-ui/layouts/home';
import { ArrowRight } from 'lucide-react';
import { baseOptions } from '@/lib/layout.shared';
import { HomeHeader } from '@/components/home-header';

const demos = [
  {
    name: 'bank',
    title: 'Bank',
    description:
      'Bank as anyone, send money to anyone — one atomic commit per transfer, on screen before the server answers, over any store.',
    to: '/demos/bank',
  },
] as const;

export const Route = createFileRoute('/demos/')({
  component: DemosIndex,
});

function DemosIndex() {
  return (
    <HomeLayout
      {...baseOptions()}
      searchToggle={{ enabled: false }}
      slots={{ header: HomeHeader }}
    >
      <main className="mx-auto w-full max-w-2xl flex-1 px-6 py-16">
        <section className="space-y-1">
          <h1 className="text-3xl font-semibold tracking-tight">Demos</h1>
          <p className="text-muted-foreground">
            Small, real applications — each one exists to show a toolkit doing
            its job in production.
          </p>
        </section>

        <ul className="mt-8 divide-y">
          {demos.map((demo) => (
            <li key={demo.name}>
              <Link to={demo.to} className="group flex items-center gap-4 py-5">
                <div className="min-w-0 flex-1">
                  <h2 className="font-medium group-hover:underline group-hover:underline-offset-4">
                    {demo.title}
                  </h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {demo.description}
                  </p>
                </div>
                <ArrowRight className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-foreground" />
              </Link>
            </li>
          ))}
        </ul>
      </main>
    </HomeLayout>
  );
}
