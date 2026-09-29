import { createFileRoute } from '@tanstack/react-router';
import { Button } from '@kstackz/ui-toolkit/components/ui/button';
import {
  InstallPrompt,
  useDisplayMode,
  useInstall,
} from '@kstackz/pwa-toolkit/extras';
import { useEffect, useState } from 'react';
import {
  Actions,
  Checklist,
  Code,
  Controls,
  Notice,
  Page,
  Playground,
  Stage,
  StateTrack,
  Value,
  Values,
} from '../components/index.ts';

export const Route = createFileRoute('/install')({ component: Install });

const STATES = [
  {
    id: 'Unsupported',
    hint: 'This browser has not offered install: no install event yet, or no install API at all.',
  },
  {
    id: 'Available',
    hint: 'The browser is ready to install. The prompt is the app’s own; the browser’s dialog opens from it.',
  },
  {
    id: 'ManualIos',
    hint: 'iOS Safari has no install API, so the prompt shows the Share → Add to Home Screen steps instead.',
  },
  {
    id: 'Dismissed',
    hint: 'Closed with “Not now”. It stays quiet for 30 days; clear this site’s storage to see it again.',
  },
  {
    id: 'Installed',
    hint: 'Installed: it runs in a window of its own, or the browser reported the install.',
  },
];

type Manifest = {
  readonly name?: string;
  readonly short_name?: string;
  readonly display?: string;
  readonly theme_color?: string;
};

/** The manifest this page links, as the browser reads it. */
const useManifest = () => {
  const [manifest, setManifest] = useState<Manifest | null>(null);
  useEffect(() => {
    const href = document
      .querySelector('link[rel="manifest"]')
      ?.getAttribute('href');
    if (href === null || href === undefined) return;
    void fetch(href)
      .then((r) => r.json() as Promise<Manifest>)
      .then(setManifest, () => undefined);
  }, []);
  return manifest;
};

/** The app as a home screen shows it: icon, name, how it opens. */
function ManifestCard(props: { readonly manifest: Manifest | null }) {
  const m = props.manifest;
  return (
    <div className="flex items-center gap-4 rounded-2xl bg-background p-3 pr-5 shadow-sm ring-1 ring-foreground/10">
      <img
        src="/icons/icon-192.png"
        alt=""
        width={56}
        height={56}
        className="size-14 rounded-[14px] ring-1 ring-foreground/10"
      />
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="truncate font-medium">
          {m?.name ?? 'PWA Playground'}
        </span>
        <span className="truncate font-mono text-xs text-muted-foreground">
          {m === null
            ? 'manifest not linked in dev'
            : `${m.short_name ?? '—'} · ${m.display ?? 'browser'}`}
        </span>
      </div>
      {m?.theme_color === undefined ? null : (
        <span
          title={`theme_color ${m.theme_color}`}
          className="ml-2 size-5 shrink-0 rounded-full ring-1 ring-foreground/15"
          style={{ backgroundColor: m.theme_color }}
        />
      )}
    </div>
  );
}

const CODE = `import { InstallPrompt, useInstall } from '@kstackz/pwa-toolkit/extras';

// In the root: the browser offers install once, early.
useInstall();

// Anywhere: the ready-made sheet, with manual steps on iOS…
<InstallPrompt />

// …or your own button.
const install = useInstall();
if (install.state._tag === 'Available') {
  const outcome = await install.prompt(); // 'accepted' | 'dismissed'
}`;

function Install() {
  const install = useInstall();
  const displayMode = useDisplayMode();
  const manifest = useManifest();
  const [outcome, setOutcome] = useState<string>('none yet');

  return (
    <Page
      path="/install"
      testId="scenario-install"
      lede={
        <p>
          Once the manifest, icons and worker qualify, the browser offers to
          install the app. The toolkit catches that moment, keeps it, and lets
          you ask at a better one.
        </p>
      }
    >
      <InstallPrompt />
      <Playground>
        <Stage className="gap-8 py-10">
          <ManifestCard manifest={manifest} />
          <StateTrack
            label="Install state"
            states={STATES}
            current={install.state._tag}
            testId="install-track"
          />
        </Stage>
        <Controls>
          <Actions>
            <Button
              data-testid="install-prompt"
              onClick={() => void install.prompt().then(setOutcome)}
            >
              Open the browser prompt
            </Button>
            <Button
              variant="ghost"
              data-testid="install-dismiss"
              onClick={install.dismiss}
            >
              Dismiss for 30 days
            </Button>
          </Actions>
          <p className="text-sm text-pretty text-muted-foreground">
            Chrome and Edge offer it once the page has been used a little.
          </p>
        </Controls>
        <Values>
          <Value label="State" testId="install-state">
            {install.state._tag}
          </Value>
          <Value label="Display" testId="install-display-mode">
            {displayMode}
          </Value>
          <Value label="Last prompt" testId="install-outcome">
            {outcome}
          </Value>
        </Values>
      </Playground>
      <Code title="Install" code={CODE} />
      <Notice
        items={[
          <>
            The browser fires <code>beforeinstallprompt</code> once and early,
            so <code>useInstall()</code> lives in the root and every page sees
            the same state.
          </>,
          'Any way of closing the prompt counts as a dismissal, so it never nags on the next visit.',
          <>
            Installed, the window has no address bar and the display mode reads{' '}
            <code>standalone</code>.
          </>,
        ]}
      />
      <Checklist
        steps={[
          'Open this page in Chrome or Edge. Within a moment the state turns Available and the prompt appears.',
          'Close it with “Not now”: that counts as a dismissal for 30 days. Clear this site’s local storage to see it again.',
          'On an iPhone, open it in Safari to see the Share → Add to Home Screen steps.',
          'Launch the installed app: Display reads standalone and the state reads Installed.',
        ]}
      />
    </Page>
  );
}
