import { useState } from 'react';
import type { ReactNode } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  History,
  LayoutDashboard,
  LogOut,
  FolderKanban,
  Settings2,
} from 'lucide-react';
import { Router, useRouter } from '@kestack/kabuki/routing';
import { BASE, Routes } from '../routes/index.ts';
import type { Route } from '../routes/index.ts';
import { Case, Page, chip } from '../parts/index.ts';

const tool =
  'grid size-7 shrink-0 place-items-center rounded-md text-muted-foreground transition-colors duration-150 outline-offset-1 hover:bg-background hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring disabled:pointer-events-none disabled:opacity-35';

/**
 * The app's own address bar, read from the Router: Back and Forward through
 * its history, the URL it is at, and the whole history, as entries. In
 * memory this is the only address there is; on TanStack it is the same as
 * the browser's.
 */
export function Toolbar() {
  const router = useRouter<Route>();
  const [open, setOpen] = useState(false);
  const path = router.href.startsWith(BASE)
    ? router.href.slice(BASE.length) || '/'
    : router.href;
  return (
    <div className="relative flex h-11 shrink-0 items-center gap-1 border-b border-border bg-muted/40 px-2">
      <button
        type="button"
        aria-label="Back"
        className={tool}
        disabled={!router.canGoBack}
        onClick={router.back}
      >
        <ArrowLeft className="size-4" />
      </button>
      <button
        type="button"
        aria-label="Forward"
        className={tool}
        disabled={!router.canGoForward}
        onClick={router.forward}
      >
        <ArrowRight className="size-4" />
      </button>
      <div className="mx-1.5 flex h-7 min-w-0 flex-1 items-center gap-3 rounded-lg bg-background px-3 text-xs">
        <code className="min-w-0 flex-1 truncate font-mono">
          <span className="text-muted-foreground/60">{BASE}</span>
          {path}
        </code>
        <span className="hidden shrink-0 truncate text-muted-foreground @xl:block">
          {router.title}
        </span>
      </div>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className="flex h-7 shrink-0 items-center gap-1.5 rounded-md px-2 text-xs text-muted-foreground transition-colors duration-150 hover:bg-background hover:text-foreground aria-expanded:bg-background aria-expanded:text-foreground"
      >
        <History className="size-3.5" />
        <span className="tabular-nums">
          {router.at + 1}/{router.entries.length}
        </span>
      </button>
      {open && (
        <ol className="absolute top-full right-2 z-30 mt-1 flex max-h-80 w-80 flex-col overflow-y-auto rounded-xl border border-border bg-popover p-1 shadow-[0_8px_32px_-8px_rgb(0_0_0/0.25)]">
          {router.entries.map((entry, index) => (
            <li key={entry.key}>
              <button
                type="button"
                onClick={() => {
                  router.goTo(index);
                  setOpen(false);
                }}
                aria-current={index === router.at ? 'true' : undefined}
                className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs hover:bg-muted aria-[current=true]:bg-muted aria-[current=true]:font-medium"
              >
                <span className="w-4 text-muted-foreground tabular-nums">
                  {index + 1}
                </span>
                <code className="truncate font-mono">
                  {Routes.path(entry.route)}
                </code>
              </button>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

/** Where the signed-in app goes. Made when drawn: the Routes read this module before they are made. */
const nav = () =>
  [
    ['Dashboard', Routes.Dashboard(), LayoutDashboard],
    ['Projects', Routes.Projects(), FolderKanban],
    ['Settings', Routes.Settings(), Settings2],
  ] as const;

/** The signed-in app around a page: where to go, and who is signed in. */
export function Shell({
  route,
  name,
  onSignOut,
  children,
}: {
  /** The Route the app is at; none on a URL that names no place. */
  readonly route: Route | undefined;
  readonly name: string;
  readonly onSignOut: () => void;
  readonly children: ReactNode;
}) {
  const NAV = nav();
  return (
    <div className="flex min-h-0 flex-1">
      <aside className="flex w-48 shrink-0 flex-col gap-1 border-r border-border p-3 max-@2xl:hidden">
        <span className="px-2 pb-3 text-sm font-semibold tracking-tight">
          Acme
        </span>
        {NAV.map(([label, to, Icon]) => (
          <Router.Link
            key={label}
            to={to}
            aria-current={route?._tag === to._tag ? 'page' : undefined}
            className="flex h-8 items-center gap-2 rounded-lg px-2 text-[13px] text-muted-foreground transition-colors duration-150 hover:bg-muted hover:text-foreground aria-[current=page]:bg-muted aria-[current=page]:font-medium aria-[current=page]:text-foreground"
          >
            <Icon className="size-4" />
            {label}
          </Router.Link>
        ))}
        <div className="mt-auto flex items-center justify-between gap-2 rounded-lg border border-border p-2">
          <span className="truncate text-xs font-medium">{name}</span>
          <button
            type="button"
            aria-label="Sign out"
            title="Sign out: the URL stays"
            onClick={onSignOut}
            className="grid size-6 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <LogOut className="size-3.5" />
          </button>
        </div>
      </aside>
      <div className="relative min-h-0 flex-1 overflow-y-auto">
        <nav className="flex gap-1 border-b border-border p-2 @2xl:hidden">
          {NAV.map(([label, to]) => (
            <Router.Link key={label} to={to} className={chip}>
              {label}
            </Router.Link>
          ))}
          <button
            type="button"
            onClick={onSignOut}
            className={`${chip} ml-auto`}
          >
            Sign out
          </button>
        </nav>
        <div className="mx-auto w-full max-w-3xl px-6 py-8">{children}</div>
      </div>
    </div>
  );
}

/** The public page at /. */
export function Landing() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6 px-6 text-center">
      <div className="flex flex-col gap-2">
        <h2 className="text-2xl font-semibold tracking-tight">Acme</h2>
        <p className="max-w-sm text-[13px] text-muted-foreground">
          The only public page. Everything else needs you signed in, and keeps
          its URL while it asks.
        </p>
      </div>
      <div className="flex flex-wrap justify-center gap-2">
        <Router.Link className={chip} to={Routes.SignIn()}>
          Sign in
        </Router.Link>
        <Router.Link className={chip} to={Routes.Settings.Billing.Invoices()}>
          Straight to the invoices
        </Router.Link>
        <Router.Link
          className={chip}
          to={Routes.Projects.Project.Share({ id: 3 })}
        >
          Straight to a dialog
        </Router.Link>
      </div>
    </div>
  );
}

/** Sign-in, where a page needs a user: the URL is left as it is. */
export function SignInCard({
  wanted,
  children,
}: {
  /** The URL that needs a user, or none on /sign-in itself. */
  readonly wanted: string | null;
  readonly children: ReactNode;
}) {
  return (
    <div className="flex flex-1 items-center justify-center px-6">
      <div className="flex w-full max-w-sm flex-col gap-5">
        <div className="flex flex-col gap-1">
          <h2 className="text-lg font-semibold tracking-tight">Sign in</h2>
          <p className="text-[13px] leading-relaxed text-muted-foreground">
            {wanted ? (
              <>
                <code className="font-mono text-foreground">{wanted}</code>{' '}
                needs a signed-in user. The URL stays as it is: signing in opens
                it.
              </>
            ) : (
              'Signing in from here goes on to the dashboard, with this entry replaced.'
            )}
          </p>
        </div>
        {children}
        <Router.Link
          className="text-center text-xs text-muted-foreground hover:text-foreground"
          to={Routes.Home()}
        >
          Back to the public page
        </Router.Link>
      </div>
    </div>
  );
}

/** What a signed-in user sees for the instant a public page is on its way to the dashboard. */
export function Redirecting() {
  return (
    <p className="text-[13px] text-muted-foreground">On to the dashboard…</p>
  );
}

export function NotFound({ path }: { readonly path: string }) {
  return (
    <Page
      title="Nothing here"
      about={
        <>
          No place is written <code className="font-mono">{path}</code>.
        </>
      }
    >
      <Case title="Not found is a place too">
        A URL that names nothing, or a param that does not read, like
        /projects/abc, is the not-found Route: the root page is handed its path,
        and draws it like any page.
      </Case>
      <div>
        <Router.Link className={chip} to={Routes.Dashboard()}>
          Back to the dashboard
        </Router.Link>
      </div>
    </Page>
  );
}
