import { createFileRoute } from '@tanstack/react-router';
import { Button } from 'kui-toolkit/components/ui/button';
import { usePwaUpdate } from 'pwa-toolkit/react';
import { useEffect, useState } from 'react';
import {
  Actions,
  type Outcome,
  Panel,
  Readout,
  Readouts,
  ScenarioPage,
} from '../components/index.ts';
import { buildLabel, pageBuildId, updateMode } from '../lib/build.ts';

export const Route = createFileRoute('/update')({ component: Update });

const STATE_OUTCOME: Record<string, [Outcome, string]> = {
  Idle: ['idle', 'Up to date'],
  Checking: ['running', 'Checking'],
  Available: ['success', 'Update ready'],
  Applying: ['running', 'Applying'],
  Unsupported: ['failure', 'No worker'],
};

function Update() {
  const update = usePwaUpdate();
  const [buildId, setBuildId] = useState<string | null>(null);
  const [lastCheck, setLastCheck] = useState<string>('never');
  useEffect(() => setBuildId(pageBuildId()), []);
  const [outcome, label] = STATE_OUTCOME[update.state._tag] ?? [
    'idle',
    update.state._tag,
  ];

  return (
    <ScenarioPage
      id="update"
      title="Update Prompt"
      proves={
        <p>
          Every deploy has a new Build Label, so a new Build ID. The tab checks
          for a new worker on load, on focus and every 60 minutes. When one is
          installed and waiting, the state turns Available and the Update Prompt
          toast appears. Nothing reloads unasked: accepting activates the new
          worker and every open tab reloads into it once (Coordinated Reload).
        </p>
      }
      steps={[
        'Open this page in two tabs, then deploy a new build.',
        'Press Check now, or just focus a tab. Both tabs show “A new version is available.”',
        'Press Reload in one tab: both reload exactly once and show the new Build ID.',
        'Deployed with PWA_UPDATE_MODE=auto-on-navigation, an Available update applies on the next route change instead: follow any link once the state turns Available.',
      ]}
    >
      <Panel
        title="This tab"
        outcome={outcome}
        outcomeLabel={label}
        outcomeTestId="update-outcome"
      >
        <Readouts>
          <Readout
            label="Build Label"
            testId="update-build-label"
            value={buildLabel}
          />
          <Readout
            label="Build ID"
            testId="update-build-id"
            value={buildId ?? 'none'}
          />
          <Readout
            label="Update mode"
            testId="update-mode"
            value={updateMode}
          />
          <Readout
            label="Update state"
            testId="update-state"
            value={update.state._tag}
          />
          <Readout
            label="Last check"
            testId="update-last-check"
            value={lastCheck}
          />
        </Readouts>
        <Actions>
          <Button
            data-testid="update-check"
            onClick={() =>
              void update
                .check()
                .then(() => setLastCheck(new Date().toISOString()))
            }
          >
            Check now
          </Button>
          <Button
            variant="outline"
            data-testid="update-apply"
            disabled={update.state._tag !== 'Available'}
            onClick={() => void update.apply()}
          >
            Apply update
          </Button>
        </Actions>
      </Panel>
    </ScenarioPage>
  );
}
