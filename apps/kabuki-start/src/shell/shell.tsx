import type { ReactNode } from 'react';
import { Button } from '@kestack/web-platform/components/button';
import { MoonIcon, SunIcon } from '@kestack/web-platform/components/lucide';
import { Router, usePending, useRouter } from '@kestack/kabuki/routing';
import { Start } from '@kestack/kabuki/start';
import { clock } from '../parts/index.ts';
import { Routes } from '../routes.ts';
import type { Route } from '../routes.ts';
import { Theme } from '../theme/index.ts';

/*
 * What is around every page: the nav, a bar while a move waits on its
 * Loaders, and a footer that says when the server drew this page and
 * whether the Runtime has started.
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

/** The content column every part of the page lines up on. */
const column = 'mx-auto w-full max-w-5xl px-4 sm:px-6';

/** A thin bar across the top while the Router waits on a move's Loaders. */
function Progress() {
  const pending = usePending<Route>();
  return (
    <div
      data-testid="pending"
      data-pending={pending ? Routes.path(pending.to) : undefined}
      aria-hidden
      className={`fixed inset-x-0 top-0 z-50 h-0.5 origin-left bg-primary transition-[transform,opacity] ${
        pending
          ? 'scale-x-75 opacity-100 duration-[2s] ease-out'
          : 'scale-x-100 opacity-0 duration-200'
      }`}
    />
  );
}

/** Switches to the other theme; the icon follows `<html>`, so it is right from the first paint. */
function ThemeToggle() {
  const { toggleTheme } = Theme.useTheme();
  return (
    <Button
      variant="ghost"
      size="icon-sm"
      onClick={toggleTheme}
      aria-label="Switch theme"
      className="order-2 ml-auto text-muted-foreground sm:order-3"
    >
      <MoonIcon className="dark:hidden" />
      <SunIcon className="hidden dark:block" />
    </Button>
  );
}

function Nav() {
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

function Footer({ live }: { readonly live: number | null }) {
  const drawn = Start.useDrawn();
  return (
    <footer className="border-t border-border">
      <div
        className={`${column} flex flex-col gap-2 py-6 font-mono text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between`}
      >
        <p className="flex items-center gap-2">
          <span
            aria-hidden
            className={`size-1.5 rounded-full ${drawn ? 'bg-positive' : 'bg-muted-foreground/40'}`}
          />
          <span data-testid="document">
            {drawn
              ? `Page drawn by the server at ${clock(drawn.at)}, build ${drawn.build?.slice(0, 8) ?? 'dev'}`
              : 'Not served by Start'}
          </span>
        </p>
        <p className="flex items-center gap-2">
          <span
            aria-hidden
            className={`size-1.5 rounded-full ${live === null ? 'bg-muted-foreground/40' : 'bg-sky-500'}`}
          />
          <span data-testid="runtime" data-live={live !== null}>
            {live === null
              ? 'Runtime not started'
              : `Runtime live, ${clock(live)}`}
          </span>
        </p>
      </div>
    </footer>
  );
}

export function Shell({
  live,
  children,
}: {
  /** The Time of the Runtime's last tick, or `null` before it starts. */
  readonly live: number | null;
  readonly children: ReactNode;
}) {
  return (
    <div className="flex min-h-dvh flex-col">
      <Progress />
      <header className="sticky top-0 z-40 border-b border-border bg-background/85 backdrop-blur-sm">
        <Nav />
      </header>
      <main className={`${column} flex-1 py-10 sm:py-14`}>{children}</main>
      <Footer live={live} />
    </div>
  );
}
