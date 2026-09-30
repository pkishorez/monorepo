import { createFileRoute, Link } from '@tanstack/react-router';
import { Button } from '@kstackz/ui-toolkit/components/ui/button';
import { MoonIcon, RefreshCwIcon, SunIcon } from '@kstackz/ui-toolkit/lucide';
import { usePwa } from '@kstackz/pwa-toolkit/react';
import { type ReactNode, useState } from 'react';
import { appTheme } from '../common/theme.ts';

export const Route = createFileRoute('/')({
  component: Home,
});

/** One Example: a complete app of one layout or behaviour, under its own route. */
interface Example {
  readonly to: '/app-shell';
  readonly title: string;
  readonly summary: string;
  readonly preview: ReactNode;
}

const EXAMPLES: ReadonlyArray<Example> = [
  {
    to: '/app-shell',
    title: 'App Shell',
    summary:
      'A sidebar, a header and the page. On a phone the sidebar pushes the page aside; on a wide screen it sits beside it. Tweak each part on or off.',
    preview: <AppShellPreview />,
  },
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

// The card last opened, so going back shrinks the Example into it.
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
 * to reload; once it waits, this button reloads into it too.
 */
function UpdateCheck() {
  const pwa = usePwa();
  const [result, setResult] = useState<
    'checking' | 'downloading' | 'current'
  >();
  const status = pwa.status._tag;
  // No worker yet (dev, first visit, or an unsupported browser): nothing to check.
  if (status === 'Unsupported' || status === 'Installing') return null;

  if (status !== 'Ready') {
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

  return (
    <Button
      variant="ghost"
      size="sm"
      className="min-h-11 md:min-h-8"
      disabled={result === 'checking' || result === 'downloading'}
      onClick={() => void check()}
    >
      <RefreshCwIcon
        aria-hidden="true"
        className={result === 'checking' ? 'animate-spin' : undefined}
      />
      <span role="status">
        {result === 'checking'
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
        <h1 className="text-2xl font-semibold tracking-tight">Examples</h1>
        <p className="mt-1 text-muted-foreground">
          Each one is a complete app. Open one, then read its folder.
        </p>
        <ul className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {EXAMPLES.map((example) => (
            <li key={example.to}>
              <Link
                to={example.to}
                viewTransition
                onClick={(event) => {
                  opened = example.to;
                  // Named now, before the view transition snapshots this page.
                  const preview =
                    event.currentTarget.querySelector<HTMLElement>(
                      '[data-preview]',
                    );
                  if (preview) preview.style.viewTransitionName = 'example';
                }}
                className="group flex flex-col overflow-hidden rounded-xl bg-card ring-1 ring-edge transition-shadow duration-150 hover:shadow-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              >
                <div
                  data-preview
                  className="aspect-[16/10] border-b border-border"
                  style={
                    opened === example.to
                      ? { viewTransitionName: 'example' }
                      : undefined
                  }
                >
                  {example.preview}
                </div>
                <div className="flex flex-col gap-1 p-4">
                  <span className="font-medium">{example.title}</span>
                  <span className="text-sm text-muted-foreground">
                    {example.summary}
                  </span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      </main>
    </div>
  );
}
