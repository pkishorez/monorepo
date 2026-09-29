import { createFileRoute } from '@tanstack/react-router';
import { Button } from '@kstackz/ui-toolkit/components/ui/button';
import { usePwa } from '@kstackz/pwa-toolkit/react';
import { useState } from 'react';
import {
  Actions,
  BuiltAt,
  Checklist,
  Code,
  Controls,
  Hint,
  Notice,
  Page,
  Playground,
  Stage,
  StateTrack,
  Value,
  Values,
} from '../components/index.ts';
import { buildLabel, updateMode } from '../lib/build.ts';
import { usePageRefresh } from '../shell/index.ts';

export const Route = createFileRoute('/update')({ component: Update });

const STATES = [
  {
    id: 'Installing',
    hint: 'The first worker is installing; this tab is not controlled yet.',
  },
  {
    id: 'Ready',
    hint: 'Up to date. The tab checks again on load, on focus and every hour.',
  },
  {
    id: 'UpdateReady',
    hint: 'A new build is installed and waiting. The toast asks; nothing reloads until you say so.',
  },
  {
    id: 'Updating',
    hint: 'Accepted: the new worker takes over and every open tab reloads into it, once.',
  },
  {
    id: 'Unsupported',
    hint: 'No service worker here: dev without PWA_DEV, or a browser without the API.',
  },
];

const CODE = `import { PwaProvider, UpdatePrompt, usePwa } from '@kstackz/pwa-toolkit/react';

// In the root: the toast shows itself when a build is waiting.
<PwaProvider>
  <App />
  <UpdatePrompt />
</PwaProvider>

// Or drive it yourself.
const pwa = usePwa();
pwa.status._tag;          // 'Ready' | 'UpdateReady' | …
await pwa.checkForUpdate();
await pwa.applyUpdate();  // every tab reloads into it once`;

function Update() {
  const pwa = usePwa();
  const [lastCheck, setLastCheck] = useState<string | null>(null);
  const check = () =>
    pwa.checkForUpdate().then(() => setLastCheck(new Date().toISOString()));
  usePageRefresh(check);
  const ready = pwa.status._tag === 'UpdateReady';

  return (
    <Page
      path="/update"
      testId="scenario-update"
      lede={
        <p>
          Every deploy is a new build. Open tabs find it in the background,
          install it, and then wait for you: accept, and every tab moves to it
          at the same moment.
        </p>
      }
    >
      <Playground>
        <Stage className="gap-6 py-10">
          <div className="flex items-baseline gap-2 font-mono text-sm">
            <span className="text-muted-foreground">this tab runs</span>
            <span data-testid="update-build-id" className="font-medium">
              {pwa.version.buildId ?? 'no build id'}
            </span>
          </div>
          <StateTrack
            label="Update status"
            states={STATES}
            current={pwa.status._tag}
            testId="update-state"
          />
        </Stage>
        <Controls>
          <Actions>
            <Button
              // Once a build waits, applying it is the next step.
              variant={ready ? 'outline' : 'default'}
              data-testid="update-check"
              onClick={() => void check()}
            >
              Check now
            </Button>
            <Button
              variant={ready ? 'default' : 'outline'}
              data-testid="update-apply"
              disabled={!ready}
              onClick={() => void pwa.applyUpdate()}
            >
              Apply update
            </Button>
          </Actions>
          <p className="text-sm text-pretty text-muted-foreground">
            On a phone, pull down to check too.
          </p>
        </Controls>
        <Values>
          <Value label="Label" testId="update-build-label">
            {buildLabel}
          </Value>
          <Value label="Built" testId="update-built-at">
            <BuiltAt iso={pwa.version.builtAt} />
          </Value>
          <Value label="Commit" testId="update-commit">
            {pwa.version.commit?.slice(0, 7) ?? 'unknown'}
          </Value>
          <Value label="Mode" testId="update-mode">
            {updateMode}
          </Value>
          <Value label="Checked" testId="update-last-check">
            {lastCheck === null ? 'never' : <BuiltAt iso={lastCheck} />}
          </Value>
        </Values>
      </Playground>
      <Hint>
        To see the prompt, keep this tab open and deploy a new build (a new{' '}
        <code>BUILD_LABEL</code> is enough), then focus the tab or press Check
        now.
      </Hint>
      <Code title="Updates" code={CODE} />
      <Notice
        items={[
          'A new build never takes over a page you are using. The worker installs, then waits for consent.',
          'Accepting in one tab reloads every open tab exactly once, so no tab keeps talking to an old worker.',
          <>
            Built with <code>PWA_UPDATE_MODE=auto-on-navigation</code>, a
            waiting build applies on the next link you follow instead of asking.
          </>,
        ]}
      />
      <Checklist
        steps={[
          'Open this page in two tabs, then deploy a new build.',
          'Press Check now, or just focus a tab. Both tabs show “A new version is available.”',
          'Press Reload in one tab: both reload exactly once and show the new Build ID.',
          'Deployed with PWA_UPDATE_MODE=auto-on-navigation, a ready update applies on the next route change instead (the root calls usePwa().applyUpdate): follow any link once the status turns UpdateReady.',
        ]}
      />
    </Page>
  );
}
