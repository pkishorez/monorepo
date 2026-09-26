import { createFileRoute } from '@tanstack/react-router';
import { Button } from 'kui-toolkit/components/ui/button';
import { usePwaUpdate } from 'pwa-toolkit/react';
import { useEffect, useState } from 'react';
import {
  Actions,
  Panel,
  Readout,
  Readouts,
  ScenarioPage,
} from '../components/index.ts';
import { buildLabel, pageBuildId } from '../lib/build.ts';

export const Route = createFileRoute('/update')({ component: Update });

function Update() {
  const update = usePwaUpdate();
  const [buildId, setBuildId] = useState<string | null>(null);
  const [lastCheck, setLastCheck] = useState<string>('never');
  useEffect(() => setBuildId(pageBuildId()), []);

  return (
    <ScenarioPage
      id="update"
      title="Update Prompt"
      explanation={
        <>
          <p>
            Every deploy has a new Build Label, so a new Build ID. The tab
            checks for a new worker on load, on focus and every 60 minutes; when
            one is installed and waiting, the state turns Available and the
            Update Prompt toast appears.
          </p>
          <p>
            Accepting activates the new worker and every open tab reloads into
            it (Coordinated Reload). Nothing reloads unasked. Try it with two
            tabs open.
          </p>
        </>
      }
    >
      <Panel title="This tab">
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
