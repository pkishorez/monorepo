import type { TestStatus, VtestConfigFeature, VtestHealth } from '../types';

const DOT: Record<TestStatus, string> = {
  pass: 'bg-emerald-500',
  fail: 'bg-destructive',
  skip: 'bg-muted-foreground/50',
  pending: 'bg-amber-500',
  running: 'bg-sky-500 animate-pulse',
};

const LABEL: Record<TestStatus, string> = {
  pass: 'Passed',
  fail: 'Failed',
  skip: 'Skipped',
  pending: 'Pending',
  running: 'Running',
};

/** A small colored dot reflecting a test/group status. */
export function StatusDot({ status }: { status: TestStatus }) {
  return (
    <span
      className={`inline-block size-2.5 shrink-0 rounded-full ${DOT[status]}`}
      aria-label={LABEL[status]}
    />
  );
}

const HEALTH_DOT: Record<VtestHealth, string> = {
  pass: 'bg-emerald-500',
  fail: 'bg-destructive',
  pending: 'bg-amber-500',
  unknown: 'bg-muted-foreground/30',
};

/** A small dot reflecting a feature's roll-up health. */
export function HealthDot({ health }: { health: VtestHealth }) {
  return (
    <span className={`size-1.5 shrink-0 rounded-full ${HEALTH_DOT[health]}`} />
  );
}

/** Roll up a group's test statuses into a single health value. */
export function groupHealth(statuses: readonly TestStatus[]): VtestHealth {
  if (statuses.length === 0) return 'unknown';
  if (statuses.some((s) => s === 'fail')) return 'fail';
  if (statuses.some((s) => s === 'running' || s === 'pending'))
    return 'pending';
  if (statuses.every((s) => s === 'pass' || s === 'skip')) return 'pass';
  return 'unknown';
}

/** Roll up an entire feature's test statuses into a single health value. */
export function featureHealth(feature: VtestConfigFeature): VtestHealth {
  return groupHealth(
    feature.groups.flatMap((g) => g.tests.map((t) => t.status)),
  );
}
