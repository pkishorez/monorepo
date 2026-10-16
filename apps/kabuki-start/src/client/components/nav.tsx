import { Router, useRouter } from '@kestack/kabuki/routing';
import { router } from '../../shared/index.ts';
import type { Route } from '../../shared/index.ts';
import { column } from './styles.ts';
import { ThemeToggle } from './theme-toggle.tsx';

/*
 * The site's name, a link to every top-level page, and the switch between
 * light and dark. On a phone the links scroll sideways. Every link
 * preloads on hover.
 */

const NAV: ReadonlyArray<{ readonly to: Route; readonly label: string }> = [
  { to: router.Blog(), label: 'Blog' },
  { to: router.Teams({ team: 'core' }), label: 'Teams' },
  { to: router.Feed(), label: 'Feed' },
  { to: router.Search(), label: 'Search' },
  { to: router.Preload(), label: 'Preload' },
];

export function Nav() {
  const { route } = useRouter<Route>();
  return (
    <nav className={`${column} flex h-12 items-center gap-4 text-sm`}>
      <Router.Link to={router.Home()} className="shrink-0 font-semibold">
        Kabuki Start
      </Router.Link>
      <ul className="flex min-w-0 flex-1 gap-3 overflow-x-auto [scrollbar-width:none]">
        {NAV.map(({ to, label }) => (
          <li key={label} className="shrink-0">
            <Router.Link
              to={to}
              aria-current={to._tag === route._tag ? 'page' : undefined}
              className="text-muted-foreground hover:text-foreground aria-[current=page]:text-foreground"
            >
              {label}
            </Router.Link>
          </li>
        ))}
      </ul>
      <ThemeToggle />
    </nav>
  );
}
