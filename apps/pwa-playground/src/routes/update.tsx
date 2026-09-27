import { createFileRoute } from '@tanstack/react-router';
import { Button } from 'kui-toolkit/components/ui/button';
import { usePwa } from 'pwa-toolkit/react';
import { useState } from 'react';
import {
  Actions,
  BuiltAt,
  type Outcome,
  Panel,
  Readout,
  Readouts,
  ScenarioPage,
} from '../components/index.ts';
import { buildLabel, updateMode } from '../lib/build.ts';

export const Route = createFileRoute('/update')({ component: Update });

const STATUS_OUTCOME: Record<string, [Outcome, string]> = {
  Installing: ['running', 'Installing'],
  Ready: ['idle', 'Up to date'],
  UpdateReady: ['success', 'Update ready'],
  Updating: ['running', 'Updating'],
  Unsupported: ['failure', 'No worker'],
};

function Update() {
  const pwa = usePwa();
  const [lastCheck, setLastCheck] = useState<string | null>(null);
  const [outcome, label] = STATUS_OUTCOME[pwa.status._tag] ?? [
    'idle',
    pwa.status._tag,
  ];

  return (
    <ScenarioPage
      id="update"
      title="Update Prompt"
      proves={
        <p>
          Every deploy has a new Build Label, so a new Build ID. The tab checks
          for a new worker on load, on focus and every 60 minutes. When one is
          installed and waiting, the status turns UpdateReady and the Update
          Prompt toast appears. Nothing reloads unasked: accepting activates the
          new worker and every open tab reloads into it once (Coordinated
          Reload).
        </p>
      }
      steps={[
        'Open this page in two tabs, then deploy a new build.',
        'Press Check now, or just focus a tab. Both tabs show “A new version is available.”',
        'Press Reload in one tab: both reload exactly once and show the new Build ID.',
        'Deployed with PWA_UPDATE_MODE=auto-on-navigation, a ready update applies on the next route change instead (the root calls usePwa().applyUpdate): follow any link once the status turns UpdateReady.',
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
            value={pwa.version.buildId ?? 'none'}
          />
          <Readout
            label="Built"
            testId="update-built-at"
            value={<BuiltAt iso={pwa.version.builtAt} />}
          />
          <Readout
            label="Commit"
            testId="update-commit"
            value={pwa.version.commit ?? 'unknown'}
          />
          <Readout
            label="Update mode"
            testId="update-mode"
            value={updateMode}
          />
          <Readout
            label="Status"
            testId="update-state"
            value={pwa.status._tag}
          />
          <Readout
            label="Last check"
            testId="update-last-check"
            value={lastCheck === null ? 'never' : <BuiltAt iso={lastCheck} />}
          />
        </Readouts>
        <Actions>
          <Button
            data-testid="update-check"
            onClick={() =>
              void pwa
                .checkForUpdate()
                .then(() => setLastCheck(new Date().toISOString()))
            }
          >
            Check now
          </Button>
          <Button
            variant="outline"
            data-testid="update-apply"
            disabled={pwa.status._tag !== 'UpdateReady'}
            onClick={() => void pwa.applyUpdate()}
          >
            Apply update
          </Button>
        </Actions>
      </Panel>
    </ScenarioPage>
  );
}
