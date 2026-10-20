import type { ReactNode } from 'react';
import { Router, useRouter } from '@kestack/kabuki/routing';
import { router } from '../../shared/pages/index.ts';
import { ThemeToggle } from './theme-toggle.tsx';

/*
 * What is around every page: the site's name, one link per page, the
 * switch between light and dark and the Account slot, then the page in a
 * column. On a narrow screen the links scroll sideways, and the name and
 * the controls keep their place.
 */

const NAV = [
  { to: router.Static(), label: 'Rendering' },
  { to: router.Items(), label: 'Preloading' },
  { to: router.Apis(), label: 'APIs' },
] as const;

export function Layout({
  account,
  children,
}: {
  /** At the top right, after the Theme toggle: the Account Switcher. */
  readonly account: ReactNode;
  readonly children: ReactNode;
}) {
  const { route } = useRouter<typeof router.route.Type>();
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-40 border-b border-border bg-background">
        <nav className="mx-auto flex h-14 w-full max-w-4xl items-center gap-3 px-5 text-sm sm:gap-6">
          <span className="shrink-0 font-semibold tracking-tight">
            Kabuki Start
          </span>
          {/* On a narrow screen the links scroll, so the controls stay in view. */}
          <ul className="flex min-w-0 flex-1 gap-1 overflow-x-auto py-1.5 [scrollbar-width:thin]">
            {NAV.map(({ to, label }) => (
              <li key={label} className="shrink-0">
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
          <div className="flex shrink-0 items-center gap-2">
            <ThemeToggle />
            {account}
          </div>
        </nav>
      </header>
      <main className="mx-auto w-full max-w-4xl flex-1 px-5 pt-12 pb-24">
        {children}
      </main>
    </div>
  );
}
