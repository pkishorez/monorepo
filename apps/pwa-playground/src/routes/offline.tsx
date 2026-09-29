import { createFileRoute } from '@tanstack/react-router';
import { Button } from '@kstackz/ui-toolkit/components/ui/button';
import { WifiOffIcon } from '@kstackz/ui-toolkit/lucide';
import { useOnline } from '@kstackz/pwa-toolkit/extras';
import { useEffect, useState } from 'react';
import {
  Checklist,
  Code,
  Hint,
  Notice,
  Page,
  Playground,
  Stage,
  Value,
  Values,
} from '../components/index.ts';
import { buildPreset } from '../lib/build.ts';

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

const CODE = `// vite.config.ts: prerender the page so the precache holds it
tanstackStart({
  pages: [{ path: '/offline', prerender: { enabled: true } }],
});

// The content preset sends a navigation with no network and no
// cached copy to /offline?from=<the page asked for>.
pwa({ preset: 'content' });`;

// Prerendered to offline.html and precached. For a navigation with no network,
// no App Shell (content preset) and no cached page, the worker redirects to
// /offline?from=<the page asked for>, so the router renders this route.
function Offline() {
  const { from } = Route.useSearch();
  const online = useOnline();
  // offline.html is prerendered without ?from=, so show it only after hydration.
  const [shownFrom, setShownFrom] = useState<string | undefined>(undefined);
  useEffect(() => setShownFrom(from), [from]);
  return (
    <Page
      path="/offline"
      title="You are offline"
      testId="scenario-offline"
      lede={
        <p>
          This is the offline page itself. The worker shows it for a page that
          has neither a network answer nor a saved copy, and it remembers where
          you were going.
        </p>
      }
    >
      <Playground>
        <Stage className="gap-5 py-10 text-center">
          <span className="flex size-14 items-center justify-center rounded-full bg-background ring-1 ring-foreground/10">
            <WifiOffIcon
              aria-hidden="true"
              className="size-6 text-muted-foreground"
            />
          </span>
          <div className="flex max-w-sm flex-col gap-1">
            <p className="font-medium">
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
          <Button
            data-testid="offline-retry"
            className="min-h-11 px-5 sm:min-h-10"
            onClick={() => {
              const target = retryTarget(from);
              if (target === undefined) location.reload();
              else location.assign(target);
            }}
          >
            Try again
          </Button>
        </Stage>
        <Values>
          <Value label="Network">{online ? 'online' : 'offline'}</Value>
          <Value label="Preset">{buildPreset}</Value>
          <Value label="Return to">{shownFrom ?? '—'}</Value>
        </Values>
      </Playground>
      <Hint>
        This deploy uses the <code>{buildPreset}</code> preset.{' '}
        {buildPreset === 'app'
          ? 'The app preset answers every offline navigation with the app shell, so you only land here for real on a content-preset deploy.'
          : 'Go offline and open a page you have not visited to land here for real.'}
      </Hint>
      <Code title="Offline page" code={CODE} />
      <Notice
        items={[
          'It is prerendered at build time and precached, so it paints with no network at all.',
          <>
            The address becomes <code>/offline?from=…</code>; Try again opens
            that page once the network is back, and only a page on this site.
          </>,
          'An app-like site rarely needs it: the app shell already opens every route offline.',
        ]}
      />
      <Checklist
        steps={[
          'The app preset answers offline navigations with the App Shell instead, so deploy with PWA_PRESET=content to reach this page for real.',
          'Go offline in DevTools and open a page you have not visited.',
          'The address becomes /offline?from=…, and Try again opens that page once the network is back.',
        ]}
      />
    </Page>
  );
}
