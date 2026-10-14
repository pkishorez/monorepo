import { Router, useRouter } from '@kestack/kabuki/routing';
import { Routes } from '../../shared/index.ts';
import type { Route } from '../../shared/index.ts';
import { column } from './styles.ts';
import { ThemeToggle } from './theme-toggle.tsx';

/*
 * The site's name, a link to every top-level place, the current one marked,
 * and the switch between light and dark.
 */

const NAV: ReadonlyArray<{ readonly to: Route; readonly label: string }> = [
  { to: Routes.Home(), label: 'Home' },
  { to: Routes.About(), label: 'About' },
  { to: Routes.Blog.Index(), label: 'Blog' },
  { to: Routes.Docs.Index(), label: 'Docs' },
  { to: Routes.Shop.Index(), label: 'Shop' },
  { to: Routes.Account.Overview(), label: 'Account' },
  { to: Routes.Dashboard.Overview(), label: 'Dashboard' },
  { to: Routes.SignIn(), label: 'Sign in' },
];

export function Nav() {
  const { route } = useRouter<Route>();
  const at = route._tag;
  return (
    <nav
      className={`${column} flex flex-wrap items-center gap-x-6 gap-y-2 py-3`}
    >
      <Router.Link
        to={Routes.Home()}
        className="order-1 flex items-center gap-2 font-semibold tracking-tight"
      >
        <span
          aria-hidden
          className="grid size-6 place-items-center rounded-md bg-primary font-mono text-xs text-primary-foreground"
        >
          K
        </span>
        Kabuki Start
      </Router.Link>
      <ul className="order-3 -mx-2 flex w-full gap-0.5 overflow-x-auto text-sm sm:order-2 sm:mx-0 sm:w-auto sm:flex-1">
        {NAV.map(({ to, label }) => (
          <li key={label}>
            <Router.Link
              to={to}
              aria-current={to._tag === at ? 'page' : undefined}
              className="block rounded-md px-2.5 py-1.5 whitespace-nowrap text-muted-foreground transition-colors hover:bg-muted hover:text-foreground aria-[current=page]:bg-muted aria-[current=page]:font-medium aria-[current=page]:text-foreground"
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
