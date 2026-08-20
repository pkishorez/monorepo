import { createFileRoute, Link } from '@tanstack/react-router';
import { HomeLayout } from 'fumadocs-ui/layouts/home';
import { ArrowUpRight } from 'lucide-react';
import { baseOptions } from '@/lib/layout.shared';
import { HomeHeader } from '@/components/home-header';

const demos = [
  {
    name: 'bank',
    title: 'Bank',
    description:
      'Bank as anyone, send money to anyone. Every transfer debits, credits and records in one atomic commit, and lands on screen before the bank has answered. Switch the store underneath it — in-memory, IndexedDB, DynamoDB — and the same app keeps working. The total never changes.',
    to: '/demos/bank',
    stack: ['std-toolkit', 'Effect RPC', 'XState', 'IndexedDB', 'DynamoDB'],
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

        <section className="mt-10 flex flex-col gap-4">
          {demos.map((demo) => (
            <Link
              key={demo.name}
              to={demo.to}
              className="group rounded-xl border bg-fd-card p-5 transition-colors hover:border-foreground/20"
            >
              <div className="flex items-center gap-2">
                <h2 className="font-medium">{demo.title}</h2>
                <ArrowUpRight className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
              </div>
              <p className="mt-2 text-sm text-muted-foreground">
                {demo.description}
              </p>
              <div className="mt-4 flex flex-wrap gap-1.5">
                {demo.stack.map((item) => (
                  <span
                    key={item}
                    className="rounded-full border px-2 py-0.5 text-[11px] text-muted-foreground"
                  >
                    {item}
                  </span>
                ))}
              </div>
            </Link>
          ))}
        </section>
      </main>
    </HomeLayout>
  );
}
