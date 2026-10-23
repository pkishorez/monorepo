import type { ContextUsage } from '../../../contract/index.js';

type RateLimit = ContextUsage['rateLimits'][number];

interface Window {
  readonly utilization: number | null;
  readonly resets_at: string | null;
}

/** The plan limits `/usage` reads, as Claude Code's usage answer has them. */
export interface PlanLimits {
  readonly five_hour?: Window | null;
  readonly seven_day?: Window | null;
  readonly seven_day_opus?: Window | null;
  readonly seven_day_sonnet?: Window | null;
  readonly model_scoped?: ReadonlyArray<
    Window & { readonly display_name: string }
  >;
}

const WINDOWS = [
  ['five_hour', '5-hour'],
  ['seven_day', 'Weekly'],
  ['seven_day_opus', 'Weekly (Opus)'],
  ['seven_day_sonnet', 'Weekly (Sonnet)'],
] as const;

const toRateLimit = (label: string, window: Window): RateLimit | undefined => {
  if (window.utilization === null) return undefined;
  const resetsAt =
    window.resets_at === null ? Number.NaN : Date.parse(window.resets_at);
  return {
    label,
    usedPercent: window.utilization,
    ...(Number.isFinite(resetsAt) ? { resetsAt } : {}),
  };
};

/** Each plan window that says how much of it is used, in percent. */
export const toRateLimits = (
  limits: PlanLimits | null,
): ReadonlyArray<RateLimit> => {
  if (limits === null) return [];
  const windows: Array<readonly [string, Window]> = [
    ...WINDOWS.flatMap(([key, label]) => {
      const window = limits[key];
      return window == null ? [] : [[label, window] as const];
    }),
    ...(limits.model_scoped ?? []).map(
      (window) => [`Weekly (${window.display_name})`, window] as const,
    ),
  ];
  return windows.flatMap(([label, window]) => {
    const limit = toRateLimit(label, window);
    return limit === undefined ? [] : [limit];
  });
};
