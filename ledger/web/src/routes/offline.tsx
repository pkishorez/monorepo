import { createFileRoute } from '@tanstack/react-router';
import { Button } from '@kstackz/web-toolkit/components/button';
import { WifiOffIcon } from '@kstackz/web-toolkit/components/lucide';

export const Route = createFileRoute('/offline')({
  validateSearch: (search): { from?: string } =>
    typeof search['from'] === 'string' ? { from: search['from'] } : {},
  component: Offline,
});

// Only a page on this site, so ?from= can't send anyone elsewhere.
const retryTarget = (from: string | undefined) => {
  if (from === undefined) return undefined;
  const url = new URL(from, location.origin);
  return url.origin === location.origin ? url.href : undefined;
};

/**
 * The Offline Fallback: prerendered and precached, shown for a page with no
 * network and no copy, as /offline?from=<that page>.
 */
function Offline() {
  const { from } = Route.useSearch();
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-start justify-center gap-4 px-6">
      <WifiOffIcon
        aria-hidden="true"
        className="size-6 text-muted-foreground"
      />
      <h1 className="text-2xl font-semibold tracking-tight">You're offline</h1>
      <p className="text-muted-foreground">
        This page needs the network. Try again once you're back online.
      </p>
      <Button
        className="min-h-11"
        onClick={() => {
          const target = retryTarget(from);
          if (target === undefined) location.reload();
          else location.assign(target);
        }}
      >
        Try again
      </Button>
    </main>
  );
}
