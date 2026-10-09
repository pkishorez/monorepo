import { createFileRoute, Link } from '@tanstack/react-router';
import { ArrowUpRight } from 'lucide-react';
import { DEMOS } from '@/lib/demos';
import { ThemeToggle } from '@/lib/theme';

const focusRing =
  'rounded-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none';

export const Route = createFileRoute('/')({
  component: Home,
});

function Home() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-xl items-center px-6 py-16">
      <ThemeToggle />
      <div className="w-full">
        <header className="mb-12">
          <div className="flex items-center gap-3">
            <img
              src="/favicon.svg"
              alt=""
              width={32}
              height={32}
              className="size-8 rounded-lg"
            />
            <h1 className="text-3xl font-medium tracking-tight">
              monorepo<span className="text-primary">.</span>
            </h1>
          </div>
          <p className="mt-2 text-sm text-muted-foreground">
            Everything I build, in one place.
          </p>
          <nav
            aria-label="Links"
            className="mt-5 flex items-center gap-5 text-sm text-muted-foreground"
          >
            <a
              href="https://github.com/pkishorez/monorepo"
              target="_blank"
              rel="noopener noreferrer"
              className={`transition-colors hover:text-primary ${focusRing}`}
            >
              GitHub
            </a>
            <a
              href="https://kishore.app"
              className={`transition-colors hover:text-primary ${focusRing}`}
            >
              kishore.app
            </a>
          </nav>
        </header>

        {DEMOS.map((demo) => (
          <Link
            key={demo.to}
            to={demo.to}
            className={`group flex items-baseline gap-3 py-3.5 ${focusRing}`}
          >
            <span className="text-sm font-medium transition-colors group-hover:text-primary">
              {demo.name}
            </span>
            <span className="h-px flex-1 bg-border/60" aria-hidden="true" />
            <span className="hidden text-xs text-muted-foreground sm:inline">
              {demo.summary}
            </span>
            <ArrowUpRight className="size-3.5 shrink-0 rotate-45 text-muted-foreground/50 transition-[color,transform] group-hover:translate-x-0.5 group-hover:text-primary" />
          </Link>
        ))}
      </div>
    </main>
  );
}
