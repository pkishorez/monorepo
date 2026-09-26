import { createFileRoute } from '@tanstack/react-router';
import { Button } from 'kui-toolkit/components/ui/button';
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
  return (
    <ScenarioPage
      id="offline"
      title="You are offline"
      explanation={
        <>
          <p>
            This is the Offline Fallback: the worker shows it for a navigation
            that has neither a network response nor a cached one.
          </p>
          <p>
            To see it with the app preset, which answers offline navigations
            with the App Shell instead, deploy with PWA_PRESET=content, go
            offline in DevTools, and open a page you have not visited. The
            address becomes /offline?from=… and Try again opens that page.
          </p>
        </>
      }
    >
      <div>
        <Button
          data-testid="offline-retry"
          onClick={() => {
            const target = retryTarget(from);
            if (target === undefined) location.reload();
            else location.assign(target);
          }}
        >
          Try again
        </Button>
      </div>
    </ScenarioPage>
  );
}
