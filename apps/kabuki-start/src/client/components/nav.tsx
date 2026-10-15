import { motion } from 'motion/react';
import { Router, useRouter } from '@kestack/kabuki/routing';
import { Routes } from '../../shared/index.ts';
import type { Place, Route } from '../../shared/index.ts';
import { MODE, modeOf } from './modes.ts';
import { quick } from './motion.ts';
import { column } from './styles.ts';
import { ThemeToggle } from './theme-toggle.tsx';

/*
 * The site's name, a link to every top-level page with the color of its
 * Render Mode, the current one marked by a pill that slides to it, and the
 * switch between light and dark. On a phone the links scroll sideways.
 * Every link preloads on hover.
 */

const NAV: ReadonlyArray<{ readonly to: Route; readonly label: string }> = [
  { to: Routes.Home(), label: 'Home' },
  { to: Routes.Blog(), label: 'Blog' },
  { to: Routes.Teams({ team: 'core' }), label: 'Teams' },
  { to: Routes.Feed(), label: 'Feed' },
  { to: Routes.Search(), label: 'Search' },
  { to: Routes.Notes(), label: 'Notes' },
  { to: Routes.Preload(), label: 'Preload' },
  { to: Routes.Flaky(), label: 'Flaky' },
];

export function Nav() {
  const { route } = useRouter<Route>();
  return (
    <nav className={`${column} flex items-center gap-3 py-2.5 sm:gap-6`}>
      <Router.Link
        to={Routes.Home()}
        className="flex shrink-0 items-center gap-2 font-semibold tracking-tight"
      >
        <span
          aria-hidden
          className="grid size-7 place-items-center rounded-lg bg-primary font-mono text-xs text-primary-foreground"
        >
          K
        </span>
        <span className="hidden sm:inline">Kabuki Start</span>
      </Router.Link>
      <ul className="-my-1 flex min-w-0 flex-1 gap-0.5 overflow-x-auto py-1 text-sm [scrollbar-width:none]">
        {NAV.map(({ to, label }) => {
          const current = to._tag === route._tag;
          const render = modeOf(to._tag as Place);
          return (
            <li key={label} className="shrink-0">
              <Router.Link
                to={to}
                aria-current={current ? 'page' : undefined}
                className="relative flex h-9 items-center gap-1.5 rounded-lg px-2.5 whitespace-nowrap text-muted-foreground transition-colors hover:text-foreground aria-[current=page]:font-medium aria-[current=page]:text-foreground"
              >
                {current && (
                  <motion.span
                    layoutId="nav-current"
                    transition={quick}
                    className="absolute inset-0 -z-10 rounded-lg bg-muted"
                  />
                )}
                <span
                  aria-hidden
                  className={`size-1.5 rounded-full ${MODE[render].dot}`}
                />
                {label}
              </Router.Link>
            </li>
          );
        })}
      </ul>
      <ThemeToggle />
    </nav>
  );
}
