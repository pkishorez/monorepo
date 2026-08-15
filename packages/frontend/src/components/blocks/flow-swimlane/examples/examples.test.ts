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
    expect(
      flows.flatMap((flow) => flow?.activations ?? []).map((a) => a.outcome),
    ).toContain('failed');
    expect(flows.every((flow) => flow?.activations.length === 1)).toBe(true);
    expect(
      flows.some((flow) =>
        flow?.items.some((item) => item.kind === 'message' && item.replyTo),
      ),
    ).toBe(true);
    expect(
      flows.some((flow) => flow?.items.some((item) => item.kind === 'state')),
    ).toBe(true);
  });
});
