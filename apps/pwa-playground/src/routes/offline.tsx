import { createFileRoute } from '@tanstack/react-router';
import { Button } from '@kstackz/ui-toolkit/components/ui/button';
import { WifiOffIcon } from '@kstackz/ui-toolkit/lucide';
import { useEffect, useState } from 'react';
import { ScenarioPage } from '../components/index.ts';

export const Route = createFileRoute('/offline')({
  validateSearch: (search): { from?: string } =>
    typeof search['from'] === 'string' ? { from: search['from'] } : {},
  component: Offline,
});

// Only a same-origin page, so ?from= cannot send the user elsewhere.
const retryTarget = (from: string | undefined): string | undefined => {
  if (from === undefined) return undefined;
  const url = new URL(from, location.origin);
  return url.origin === location.origin ? url.href : undefined;
};

// Prerendered to offline.html and precached. For a navigation with no network,
// no App Shell (content preset) and no cached page, the worker redirects to
// /offline?from=<the page asked for>, so the router renders this route.
function Offline() {
  const { from } = Route.useSearch();
  // offline.html is prerendered without ?from=, so show it only after hydration.
  const [shownFrom, setShownFrom] = useState<string | undefined>(undefined);
  useEffect(() => setShownFrom(from), [from]);
  return (
    <ScenarioPage
      id="offline"
      title="You are offline"
      proves={
        <p>
          This is the Offline Fallback: the worker shows it for a navigation
          that has neither a network response nor a cached one.
        </p>
      }
      steps={[
        'The app preset answers offline navigations with the App Shell instead, so deploy with PWA_PRESET=content to reach this page for real.',
        'Go offline in DevTools and open a page you have not visited.',
        'The address becomes /offline?from=…, and Try again opens that page once the network is back.',
      ]}
    >
      <section
        aria-label="Connection"
        className="flex flex-col items-start gap-4 rounded-xl p-5 ring-1 ring-foreground/10 sm:flex-row sm:items-center sm:justify-between"
      >
        <div className="flex items-center gap-3.5">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-muted">
            <WifiOffIcon
              aria-hidden="true"
              className="size-5 text-muted-foreground"
            />
          </span>
          <div className="flex min-w-0 flex-col gap-0.5">
            <p className="text-sm font-medium">
              {shownFrom === undefined
                ? 'No page to return to'
                : 'Waiting to open'}
            </p>
            <p
              data-testid="offline-from"
              className="font-mono text-[13px] text-muted-foreground [overflow-wrap:anywhere]"
            >
              {shownFrom ?? 'Try again reloads this page.'}
            </p>
          </div>
        </div>
        <Button
          data-testid="offline-retry"
          className="min-h-11 w-full touch-manipulation px-4 sm:min-h-9 sm:w-auto"
          onClick={() => {
            const target = retryTarget(from);
            if (target === undefined) location.reload();
            else location.assign(target);
          }}
        >
          Try again
        </Button>
      </section>
    </ScenarioPage>
  );
}
