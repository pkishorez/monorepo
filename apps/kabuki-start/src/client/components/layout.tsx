import type { ReactNode } from 'react';
import { Router, useRouter } from '@kestack/kabuki/routing';
import { router } from '../../shared/pages/index.ts';
import { ThemeToggle } from './theme-toggle.tsx';

/*
 * What is around every page: the site's name, one link per page, the
 * switch between light and dark, then the page in a column.
 */

const NAV = [
  { to: router.Static(), label: 'Rendering' },
  { to: router.Items(), label: 'Preloading' },
  { to: router.Apis(), label: 'APIs' },
] as const;

export function Layout({ children }: { readonly children: ReactNode }) {
  const { route } = useRouter<typeof router.route.Type>();
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-40 border-b border-border bg-background">
        <nav className="mx-auto flex h-14 w-full max-w-4xl items-center gap-6 px-5 text-sm">
          <span className="font-semibold tracking-tight">Kabuki Start</span>
          <ul className="flex flex-1 gap-1">
            {NAV.map(({ to, label }) => (
              <li key={label}>
                <Router.Link
                  to={to}
                  aria-current={to._tag === route._tag ? 'page' : undefined}
                  className="rounded-md px-2.5 py-1.5 text-muted-foreground transition-colors duration-150 hover:text-foreground aria-[current=page]:bg-muted aria-[current=page]:text-foreground"
                >
                  {label}
                </Router.Link>
              </li>
            ))}
          </ul>
          <ThemeToggle />
        </nav>
      </header>
      <main className="mx-auto w-full max-w-4xl flex-1 px-5 pt-12 pb-24">
        {children}
      </main>
    </div>
  );
}
