import { useEffect, useState } from 'react';
import { Effect } from 'effect';
import { FlowTelemetry, projectJournal } from '@pkishorez/flow';
import type { RecordedFlow } from '../flow-presentation';
import { FlowSwimlane } from '../flow-swimlane';
import type { flowScenarios } from './scenarios';

type FlowScenario = (typeof flowScenarios)[number];

/** Runs one scenario against a memory sink and projects what it recorded. */
export const recordScenario = (scenario: FlowScenario) => {
  const sink = FlowTelemetry.makeMemory();
  return Effect.runPromise(
    scenario.program().pipe(Effect.provideService(FlowTelemetry, sink)),
  ).then(() => {
    const journal = sink.journal(scenario.id);
    return journal ? projectJournal(journal) : null;
  });
};

export function FlowScenarioView({ scenario }: { scenario: FlowScenario }) {
  const [flow, setFlow] = useState<RecordedFlow | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    recordScenario(scenario).then(
      (recorded) => {
        if (!active) return;
        if (recorded) setFlow(recorded);
        else setError(`Flow ${scenario.id} was not recorded.`);
      },
      (cause) => {
        if (active) setError(String(cause));
      },
    );
    return () => {
      active = false;
    };
  }, [scenario]);

  if (error) {
    return (
      <div className="rounded-xl border border-destructive/50 bg-destructive/5 p-4 text-sm text-destructive">
        {error}
      </div>
    );
  }
  if (!flow) {
    return (
      <div className="rounded-xl border bg-card p-6 text-sm text-muted-foreground">
        Running {scenario.title}…
      </div>
    );
  }
  return <FlowSwimlane flow={flow} />;
}
