import { useEffect, useState } from 'react';
import { Effect } from 'effect';
import { makeTraceRecorder } from '@pkishorez/effect-tracer/recorder';
import type { RecordedFlow } from '@pkishorez/effect-tracer/flow';
import { FlowSwimlane } from '../flow-swimlane';
import type { flowScenarios } from './scenarios';

type FlowScenario = (typeof flowScenarios)[number];

export function FlowScenarioView({ scenario }: { scenario: FlowScenario }) {
  const [flow, setFlow] = useState<RecordedFlow | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const recorder = makeTraceRecorder({ requireFinishedSpans: true });
    Effect.runPromise(recorder.instrument(scenario.program())).then(
      () => {
        if (!active) return;
        const recorded = recorder.snapshotFlow(scenario.id);
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
