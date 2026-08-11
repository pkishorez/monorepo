import { Effect } from 'effect';
import { describe, expect, it } from 'vitest';
import { makeTraceRecorder } from '@pkishorez/effect-tracer/recorder';
import { flowScenarios } from './scenarios';

describe('Flow examples', () => {
  it('runs ten real Effect programs and records a Flow for each one', async () => {
    const flows = await Promise.all(
      flowScenarios.map(async (scenario) => {
        const recorder = makeTraceRecorder({ requireFinishedSpans: true });
        await Effect.runPromise(recorder.instrument(scenario.program()));
        return recorder.snapshotFlow(scenario.id);
      }),
    );

    expect(flowScenarios).toHaveLength(10);
    expect(flows.every((flow) => flow !== null)).toBe(true);
    expect(
      flows.every((flow) =>
        flow?.items.some((item) => item.kind === 'activity'),
      ),
    ).toBe(true);
    expect(
      flows.some((flow) => flow?.items.some((item) => item.kind === 'message')),
    ).toBe(true);
    expect(flows.map((flow) => flow?.status)).toContain('failed');
  });
});
