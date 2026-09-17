import { describe, expect, it } from 'vitest';
import { recordScenario } from './runner';
import { flowScenarios } from './scenarios';

describe('Flow examples', () => {
  it('runs ten real Effect programs and records a Flow for each one', async () => {
    const flows = await Promise.all(flowScenarios.map(recordScenario));

    expect(flowScenarios).toHaveLength(10);
    expect(flows.every((flow) => flow !== null)).toBe(true);
    expect(
      flows.every((flow) => flow?.items.some((item) => item.kind === 'event')),
    ).toBe(true);
    expect(
      flows.some((flow) => flow?.items.some((item) => item.kind === 'message')),
    ).toBe(true);
    expect(
      flows.some((flow) => flow?.items.some((item) => item.kind === 'wait')),
    ).toBe(true);
    expect(
      flows.some((flow) => flow?.items.some((item) => item.kind === 'check')),
    ).toBe(true);
    expect(
      flows.flatMap((flow) => flow?.activations ?? []).map((a) => a.outcome),
    ).toContain('failed');
    expect(flows.every((flow) => (flow?.activations.length ?? 0) >= 1)).toBe(
      true,
    );
    expect(
      flows.some((flow) =>
        flow?.items.some((item) => item.kind === 'message' && item.replyTo),
      ),
    ).toBe(true);
    expect(flows.every((flow) => flow?.warnings.length === 0)).toBe(true);
  });
});
