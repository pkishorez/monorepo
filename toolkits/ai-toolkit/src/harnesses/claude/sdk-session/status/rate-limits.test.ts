import { describe, expect, it } from 'vitest';
import { toRateLimits } from './rate-limits.js';

describe('toRateLimits', () => {
  it('is empty without plan limits', () => {
    expect(toRateLimits(null)).toEqual([]);
  });

  it('labels each window that says how much is used', () => {
    expect(
      toRateLimits({
        five_hour: { utilization: 16, resets_at: '2026-10-22T02:00:00Z' },
        seven_day: { utilization: 2, resets_at: null },
        seven_day_opus: null,
        seven_day_sonnet: { utilization: null, resets_at: null },
        model_scoped: [
          { display_name: 'Fable', utilization: 0, resets_at: null },
        ],
      }),
    ).toEqual([
      {
        label: '5-hour',
        usedPercent: 16,
        resetsAt: Date.parse('2026-10-22T02:00:00Z'),
      },
      { label: 'Weekly', usedPercent: 2 },
      { label: 'Weekly (Fable)', usedPercent: 0 },
    ]);
  });
});
