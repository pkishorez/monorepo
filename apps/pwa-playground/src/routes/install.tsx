import { createFileRoute } from '@tanstack/react-router';
import { Button } from 'kui-toolkit/components/ui/button';
import { InstallPrompt, useDisplayMode, useInstall } from 'pwa-toolkit/extras';
import { useState } from 'react';
import {
  Actions,
  type Outcome,
  Panel,
  Readout,
  Readouts,
  ScenarioPage,
} from '../components/index.ts';

export const Route = createFileRoute('/install')({ component: Install });

const STATE_OUTCOME: Record<string, [Outcome, string]> = {
  Available: ['success', 'Installable'],
  ManualIos: ['success', 'Manual steps'],
  Installed: ['success', 'Installed'],
  Dismissed: ['idle', 'Dismissed'],
  Unsupported: ['idle', 'Not offered'],
};

function Install() {
  const install = useInstall();
  const displayMode = useDisplayMode();
  const [outcome, setOutcome] = useState<string>('none yet');
  const [stateOutcome, stateLabel] = STATE_OUTCOME[install.state._tag] ?? [
    'idle',
    install.state._tag,
  ];

  return (
    <ScenarioPage
      id="install"
      title="Install Prompt"
      proves={
        <p>
          Chromium fires beforeinstallprompt once the manifest, icons and worker
          qualify; the state turns Available and the Install Prompt opens (a
          sheet on small screens, a card on larger ones). iOS Safari has no
          install API, so it gets manual steps instead (ManualIos). Installed
          means the app runs standalone or the browser reported appinstalled.
        </p>
      }
      steps={[
        'Open this page in Chrome or Edge. Within a moment the state turns Available and the prompt appears.',
        'Close it with “Not now”: that counts as a dismissal for 30 days. Clear this site’s local storage to see it again.',
        'On an iPhone, open it in Safari to see the Share → Add to Home Screen steps.',
        'Launch the installed app: Display mode reads standalone and the state reads Installed.',
      ]}
    >
      <InstallPrompt />
      <Panel
        title="State"
        outcome={stateOutcome}
        outcomeLabel={stateLabel}
        outcomeTestId="install-outcome-chip"
      >
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
