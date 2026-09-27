import { useDisplayMode, useOnline } from 'pwa-toolkit/extras';
import { usePwa } from 'pwa-toolkit/react';
import { useEffect, useState } from 'react';
import { pageBuildId } from '../lib/build.ts';
import { useWorkers } from '../lib/workers.ts';
import { type Outcome, OutcomeChip } from './scenario.tsx';

function Cell(props: {
  readonly label: string;
  readonly testId: string;
  readonly value: string;
  readonly outcome: Outcome;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-2 bg-card px-4 py-3.5 last:max-lg:col-span-2">
      <dt className="text-xs text-muted-foreground">{props.label}</dt>
      <dd className="flex min-w-0 items-center">
        <OutcomeChip
          outcome={props.outcome}
          label={props.value}
          testId={props.testId}
        />
      </dd>
    </div>
  );
}

/** What this tab knows right now, in one row. Re-reads the worker every two seconds. */
export function StatusStrip() {
  const online = useOnline();
  const displayMode = useDisplayMode();
  const pwa = usePwa();
  const workers = useWorkers();
  const [buildId, setBuildId] = useState<string | null>(null);
  useEffect(() => setBuildId(pageBuildId()), []);

  const worker =
    workers === null
      ? { value: 'reading…', outcome: 'running' as const }
      : !workers.supported
        ? { value: 'unsupported', outcome: 'failure' as const }
        : workers.controller === 'none'
          ? { value: 'not in control', outcome: 'idle' as const }
          : {
              value: workers.controller.split(' ')[0] ?? 'active',
              outcome: 'success' as const,
            };

  const updateTag = pwa.status._tag;
  const updateOutcome: Outcome =
    updateTag === 'UpdateReady'
      ? 'success'
      : updateTag === 'Installing' || updateTag === 'Updating'
        ? 'running'
        : updateTag === 'Unsupported'
          ? 'failure'
          : 'idle';

  return (
    <section aria-label="Live status" data-testid="status-strip">
      <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-xl bg-border ring-1 ring-foreground/10 lg:grid-cols-5">
        <Cell
          label="Build ID"
          testId="strip-build-id"
          value={buildId ?? 'none'}
          outcome={buildId === null ? 'idle' : 'success'}
        />
        <Cell
          label="Worker"
          testId="strip-worker"
          value={worker.value}
          outcome={worker.outcome}
        />
        <Cell
          label="Network"
          testId="strip-network"
          value={online ? 'online' : 'offline'}
          outcome={online ? 'success' : 'failure'}
        />
        <Cell
          label="Display mode"
          testId="strip-display-mode"
          value={displayMode}
          outcome={displayMode === 'browser' ? 'idle' : 'success'}
        />
        <Cell
          label="Update"
          testId="strip-update"
          value={updateTag}
          outcome={updateOutcome}
        />
      </dl>
    </section>
  );
}
