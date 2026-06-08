import { Badge } from '#components/ui/badge';

import type { TestStatus } from '../types';

interface StatusBadgeProps {
  /** Live status of the test or group; `undefined` means not yet run. */
  status?: TestStatus;
}

const LABEL: Record<TestStatus, string> = {
  pass: 'Passed',
  fail: 'Failed',
  skip: 'Skipped',
  pending: 'Queued',
  running: 'Running',
};

const VARIANT: Record<
  TestStatus,
  'default' | 'secondary' | 'destructive' | 'outline'
> = {
  pass: 'default',
  fail: 'destructive',
  skip: 'outline',
  pending: 'secondary',
  running: 'secondary',
};

/**
 * Live status badge for a documented test or group. Renders nothing until the
 * first status arrives, so an un-run group stays calm. `pending` reads as
 * "Queued", matching the queued→running→pass/fail transition.
 */
export function StatusBadge({ status }: StatusBadgeProps) {
  if (!status) return null;
  return (
    <Badge variant={VARIANT[status]} className="capitalize">
      {LABEL[status]}
    </Badge>
  );
}
