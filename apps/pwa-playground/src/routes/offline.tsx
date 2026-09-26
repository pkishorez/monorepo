import { createFileRoute } from '@tanstack/react-router';
import { Button } from 'kui-toolkit/components/ui/button';
import { ScenarioPage } from '../components/index.ts';

export const Route = createFileRoute('/offline')({ component: Offline });

// Prerendered to offline.html and precached; the worker serves it for a
// navigation with no network, no App Shell (content preset) and no cached page.
function Offline() {
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
            offline in DevTools, and open a page you have not visited.
          </p>
        </>
      }
    >
      <div>
        <Button data-testid="offline-retry" onClick={() => location.reload()}>
          Try again
        </Button>
      </div>
    </ScenarioPage>
  );
}
