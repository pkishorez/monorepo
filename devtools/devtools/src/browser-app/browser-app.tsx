import { useEffect, useState } from 'react';
import {
  createRootRoute,
  createRoute,
  createRouter,
  Link,
  Outlet,
  RouterProvider,
  useMatchRoute,
} from '@tanstack/react-router';
import { Toaster } from '@monorepo/frontend/components/ui/sonner';
import { Button } from '@monorepo/frontend/components/ui/button';
import { ArrowRightIcon, MoonIcon, SunIcon } from '@monorepo/frontend/lucide';
import { DevtoolsRpcProvider } from '../client/devtools-rpc/index.js';
import { Lotel } from '../ui/lotel/lotel/index.js';
import { Laymos, LaymosHeader } from '../ui/laymos/laymos/index.js';

type Theme = 'dark' | 'light';

const readTheme = (): Theme => {
  const stored = globalThis.localStorage?.getItem('devtools:theme');
  if (stored === 'light' || stored === 'dark') return stored;
  return 'dark';
};

function applyTheme(theme: Theme) {
  document.documentElement.classList.toggle('dark', theme === 'dark');
  globalThis.localStorage?.setItem('devtools:theme', theme);
}

function Shell() {
  const [theme, setTheme] = useState<Theme>(readTheme);

  const matchRoute = useMatchRoute();
  const onLaymos = matchRoute({ to: '/laymos' }) !== false;

  useEffect(() => applyTheme(theme), [theme]);

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-background text-foreground">
      <header className="grid h-11 shrink-0 grid-cols-[1fr_auto_1fr] items-center border-b border-border/50 px-4">
        <div className="flex items-center">
          <Link
            to="/"
            className="text-sm font-medium tracking-tight text-foreground/90 transition-colors hover:text-foreground"
          >
            DevTools
          </Link>
          <nav className="ml-6 flex items-center gap-1">
            <ToolLink to="/lotel">Lotel</ToolLink>
            <ToolLink to="/laymos">Laymos</ToolLink>
          </nav>
        </div>
        <div className="flex items-center justify-center">
          {onLaymos ? <LaymosHeader /> : null}
        </div>
        <Button
          className="justify-self-end text-muted-foreground/70 hover:text-foreground"
          size="icon-sm"
          variant="ghost"
          aria-label="Toggle theme"
          title="Toggle theme"
          onClick={() =>
            setTheme((value) => (value === 'dark' ? 'light' : 'dark'))
          }
        >
          {theme === 'dark' ? (
            <SunIcon className="size-3.5" />
          ) : (
            <MoonIcon className="size-3.5" />
          )}
        </Button>
      </header>
      <main className="min-h-0 flex-1 overflow-hidden">
        <Outlet />
      </main>
      <Toaster />
    </div>
  );
}

function ToolLink({
  to,
  children,
}: {
  to: '/lotel' | '/laymos';
  children: string;
}) {
  return (
    <Link
      to={to}
      className="relative flex h-11 items-center px-2 text-sm text-muted-foreground transition-colors hover:text-foreground after:absolute after:inset-x-2 after:-bottom-px after:h-0.5 after:rounded-full after:bg-foreground after:opacity-0 after:transition-opacity data-[status=active]:font-medium data-[status=active]:text-foreground data-[status=active]:after:opacity-100"
    >
      {children}
    </Link>
  );
}

function Home() {
  return (
    <div className="h-full overflow-auto">
      <div className="mx-auto flex min-h-full w-full max-w-md flex-col justify-center px-6 py-16">
        <h1 className="text-xl font-medium tracking-tight">DevTools</h1>
        <p className="mt-1.5 text-sm text-muted-foreground">
          Runtime telemetry and architecture for local Projects.
        </p>
        <nav className="mt-10 divide-y divide-border/60 border-y border-border/60">
          <ToolRow
            to="/lotel"
            title="Lotel"
            description="Traces, Logs, and Flows from local OpenTelemetry data."
          />
          <ToolRow
            to="/laymos"
            title="Laymos"
            description="Layers, Modules, source, changes, and Stories for a Project."
          />
        </nav>
        <p className="mt-10 font-mono text-[11px] text-muted-foreground/60">
          v{__DEVTOOLS_VERSION__}
        </p>
      </div>
    </div>
  );
}

function ToolRow({
  to,
  title,
  description,
}: {
  to: '/lotel' | '/laymos';
  title: string;
  description: string;
}) {
  return (
    <Link
      to={to}
      className="group -mx-3 flex items-center justify-between gap-6 rounded-md px-3 py-5 transition-colors hover:bg-muted/40"
    >
      <span>
        <span className="block text-sm font-medium">{title}</span>
        <span className="mt-1 block text-sm text-muted-foreground">
          {description}
        </span>
      </span>
      <ArrowRightIcon className="size-4 shrink-0 text-muted-foreground/60 transition-all group-hover:translate-x-0.5 group-hover:text-foreground" />
    </Link>
  );
}

function NotFound() {
  return (
    <div className="grid h-full place-items-center px-6">
      <div className="text-center">
        <p className="text-sm font-medium">Page not found</p>
        <p className="mt-1.5 text-sm text-muted-foreground">
          There is nothing at this address.
        </p>
        <Link
          to="/"
          className="mt-6 inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          Back to DevTools <ArrowRightIcon className="size-3.5" />
        </Link>
      </div>
    </div>
  );
}

const rootRoute = createRootRoute({
  component: Shell,
  notFoundComponent: NotFound,
});
const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  component: Home,
});
const lotelRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/lotel',
  validateSearch: (search: Record<string, unknown>) => ({
    view: search.view === 'flows' ? ('flows' as const) : ('traces' as const),
    trace: typeof search.trace === 'string' ? search.trace : undefined,
    flow: typeof search.flow === 'string' ? search.flow : undefined,
  }),
  component: Lotel,
});
const laymosRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/laymos',
  component: Laymos,
});
const routeTree = rootRoute.addChildren([indexRoute, lotelRoute, laymosRoute]);
const router = createRouter({ routeTree });

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}

export function BrowserApp() {
  return (
    <DevtoolsRpcProvider>
      <RouterProvider router={router} />
    </DevtoolsRpcProvider>
  );
}
