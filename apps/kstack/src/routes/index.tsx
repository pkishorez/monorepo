import { createFileRoute, Link } from '@tanstack/react-router';
import { Button } from '@kstackz/ui-toolkit/components/ui/button';
import { MoonIcon, RefreshCwIcon, SunIcon } from '@kstackz/ui-toolkit/lucide';
import { usePwa } from '@kstackz/pwa-toolkit/react';
import { type ReactNode, useState } from 'react';
import { appTheme } from '../common/theme.ts';

export const Route = createFileRoute('/')({
  component: Home,
});

/** One Showcase: a complete app of one layout or behaviour, under its own route. */
interface Showcase {
  readonly to: '/app-shell' | '/gestures' | '/features' | '/keyboard';
  readonly title: string;
  readonly preview: ReactNode;
}

const SHOWCASES: ReadonlyArray<Showcase> = [
  { to: '/app-shell', title: 'App Shell', preview: <AppShellPreview /> },
  { to: '/gestures', title: 'Gestures', preview: <GesturesPreview /> },
  { to: '/features', title: 'Features', preview: <FeaturesPreview /> },
  { to: '/keyboard', title: 'Keyboard', preview: <KeyboardPreview /> },
];

/** A wireframe of the App Shell: the sidebar, and the page as a card beside it. */
function AppShellPreview() {
  return (
    <div className="flex size-full gap-1.5 bg-sidebar p-1.5">
      <div className="flex w-1/4 flex-col gap-1 pt-1">
        <div className="h-1.5 w-3/4 rounded-full bg-foreground/25" />
        <div className="mt-1 h-1.5 w-full rounded-full bg-foreground/15" />
        <div className="h-1.5 w-2/3 rounded-full bg-foreground/15" />
        <div className="h-1.5 w-4/5 rounded-full bg-foreground/15" />
      </div>
      <div className="flex flex-1 flex-col gap-1.5 rounded-md bg-background p-2 shadow-sm">
        <div className="h-1.5 w-1/3 rounded-full bg-foreground/25" />
        <div className="h-5 rounded bg-foreground/8" />
        <div className="h-5 rounded bg-foreground/8" />
      </div>
    </div>
  );
}

/** Two fingers on a card, one dragging it aside. */
function GesturesPreview() {
  return (
    <div className="relative size-full overflow-hidden bg-sidebar p-3">
      <div className="absolute inset-y-3 right-3 left-10 rounded-md bg-background shadow-sm" />
      <span className="absolute top-[38%] left-[40%] size-6 rounded-full bg-primary/25 ring-2 ring-primary/60" />
      <span className="absolute top-[52%] left-[58%] size-6 rounded-full bg-primary/25 ring-2 ring-primary/60" />
    </div>
  );
}

/** An inbox, one row swiped open to its actions. */
function FeaturesPreview() {
  return (
    <div className="flex size-full flex-col gap-1.5 bg-background p-2">
      <div className="h-1.5 w-1/3 rounded-full bg-foreground/25" />
      <div className="h-6 rounded bg-foreground/8" />
      <div className="flex h-6 overflow-hidden rounded">
        <div className="w-3/4 -translate-x-0 bg-foreground/8" />
        <div className="w-1/8 bg-primary/40" />
        <div className="w-1/8 bg-destructive/50" />
      </div>
      <div className="h-6 rounded bg-foreground/8" />
    </div>
  );
}

/** A list beside a note, and a key cap waiting for its next key. */
function KeyboardPreview() {
  return (
    <div className="flex size-full gap-1.5 bg-background p-2">
      <div className="flex w-1/3 flex-col gap-1">
        <div className="h-4 rounded bg-primary/25" />
        <div className="h-4 rounded bg-foreground/8" />
        <div className="h-4 rounded bg-foreground/8" />
      </div>
      <div className="flex flex-1 items-center justify-center gap-1 rounded bg-foreground/5">
        <span className="rounded border border-foreground/30 px-2 py-1 text-xs font-medium">
          g
        </span>
        <span className="text-xs text-muted-foreground">then</span>
        <span className="rounded border border-dashed border-foreground/30 px-2 py-1 text-xs">
          ?
        </span>
      </div>
    </div>
  );
}

// The card last opened, so going back shrinks the Showcase into it.
let opened: string | undefined;

function ThemeToggle() {
  const { toggleTheme } = appTheme.useTheme();
  return (
    <Button
      variant="ghost"
      size="icon"
      className="size-11 md:size-9"
      aria-label="Toggle dark mode"
      onClick={toggleTheme}
    >
      {/* Both render; CSS picks one, so the first paint is right. */}
      <SunIcon aria-hidden="true" className="hidden dark:block" />
      <MoonIcon aria-hidden="true" className="dark:hidden" />
    </Button>
  );
}

/**
 * Checks for a new deploy. A found one downloads, then the Update Prompt asks
 * to reload; once it waits, this button reloads into it too. Always shown, so
 * the header never shifts: disabled until the worker is running, and saying
 * so in dev, where there is none.
 */
function UpdateCheck() {
  const pwa = usePwa();
  const [result, setResult] = useState<
    'checking' | 'downloading' | 'current'
  >();
  const status = pwa.status._tag;

  if (status === 'UpdateReady' || status === 'Updating') {
    return (
      <Button
        size="sm"
        className="min-h-11 md:min-h-8"
        disabled={status === 'Updating'}
        onClick={() => void pwa.applyUpdate()}
      >
        Update now
      </Button>
    );
  }

  const check = async () => {
    setResult('checking');
    await pwa.checkForUpdate();
    // `update()` resolves once the new worker is found, before it downloads.
    const registration = await navigator.serviceWorker.getRegistration();
    if (registration?.installing) return setResult('downloading');
    setResult('current');
    setTimeout(() => setResult(undefined), 3000);
  };

  // `pnpm dev` runs no worker, so its pages carry no Build ID.
  const dev = pwa.version.buildId === null;
  return (
    <Button
      variant="ghost"
      size="sm"
      className="min-h-11 md:min-h-8"
      disabled={status !== 'Ready' || result !== undefined}
      onClick={() => void check()}
    >
      <RefreshCwIcon
        aria-hidden="true"
        className={result === 'checking' ? 'animate-spin' : undefined}
      />
      <span role="status">
        {dev
          ? 'No updates in dev'
          : result === 'checking'
            ? 'Checking…'
            : result === 'downloading'
              ? 'Downloading…'
              : result === 'current'
                ? 'Up to date'
                : 'Check for updates'}
      </span>
    </Button>
  );
}

function Home() {
  return (
    <div className="min-h-dvh pr-[env(safe-area-inset-right)] pl-[env(safe-area-inset-left)]">
      <appTheme.StatusBar />
      <header className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4 pt-[env(safe-area-inset-top)] box-content">
        <span className="flex items-center gap-2.5 text-[15px] font-semibold tracking-tight">
          <img src="/favicon.svg" alt="" className="size-6 rounded-md" />
          kstack
        </span>
        <div className="flex items-center gap-1">
          <UpdateCheck />
          <ThemeToggle />
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 pt-6 pb-[max(2rem,env(safe-area-inset-bottom))]">
        <h1 className="text-2xl font-semibold tracking-tight">Showcases</h1>
        <ul className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {SHOWCASES.map((showcase) => (
            <li key={showcase.to}>
              <Link
                to={showcase.to}
                viewTransition
                onClick={(event) => {
                  opened = showcase.to;
                  // Named now, before the view transition snapshots this page.
                  const preview =
                    event.currentTarget.querySelector<HTMLElement>(
                      '[data-preview]',
                    );
                  if (preview) preview.style.viewTransitionName = 'showcase';
                }}
                className="group flex flex-col overflow-hidden rounded-xl bg-card ring-1 ring-edge transition-shadow duration-150 hover:shadow-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              >
                <div
                  data-preview
                  className="aspect-[16/10] border-b border-border"
                  style={
                    opened === showcase.to
                      ? { viewTransitionName: 'showcase' }
                      : undefined
                  }
                >
                  {showcase.preview}
                </div>
                <span className="p-4 font-medium">{showcase.title}</span>
              </Link>
            </li>
          ))}
        </ul>
      </main>
    </div>
  );
}
