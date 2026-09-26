import { createFileRoute } from '@tanstack/react-router';
import { Button } from 'kui-toolkit/components/ui/button';
import { useDisplayMode, usePwaInstall } from 'pwa-toolkit/react';
import { InstallPrompt } from 'pwa-toolkit/ui';
import { useState } from 'react';
import {
  Actions,
  Panel,
  Readout,
  Readouts,
  ScenarioPage,
} from '../components/index.ts';

export const Route = createFileRoute('/install')({ component: Install });

function Install() {
  const install = usePwaInstall();
  const displayMode = useDisplayMode();
  const [outcome, setOutcome] = useState<string>('none yet');

  return (
    <ScenarioPage
      id="install"
      title="Install Prompt"
      explanation={
        <>
          <p>
            Chromium fires beforeinstallprompt once the manifest, icons and
            worker qualify; the state turns Available and the Install Prompt
            opens (a sheet on small screens, a card on larger ones). iOS Safari
            shows manual steps instead (ManualIos).
          </p>
          <p>
            Closing the prompt counts as a dismissal for 30 days. To see it
            again, clear this site&apos;s local storage. Installed means the app
            runs standalone or the browser reported appinstalled.
          </p>
        </>
      }
    >
      <InstallPrompt />
      <Panel title="State">
        <Readouts>
          <Readout
            label="Install state"
            testId="install-state"
            value={install.state._tag}
          />
          <Readout
            label="Display mode"
            testId="install-display-mode"
            value={displayMode}
          />
          <Readout
            label="Last prompt"
            testId="install-outcome"
            value={outcome}
          />
        </Readouts>
        <Actions>
          <Button
            data-testid="install-prompt"
            onClick={() => void install.prompt().then(setOutcome)}
          >
            Open the browser prompt
          </Button>
          <Button
            variant="outline"
            data-testid="install-dismiss"
            onClick={install.dismiss}
          >
            Dismiss for 30 days
          </Button>
        </Actions>
      </Panel>
    </ScenarioPage>
  );
}
