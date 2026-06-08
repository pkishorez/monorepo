import { Badge } from '#components/ui/badge';

import type { VtestHealth } from '../types';

interface HealthBadgeProps {
  health: VtestHealth;
}

const LABEL: Record<VtestHealth, string> = {
  pass: 'Passing',
  fail: 'Failing',
  pending: 'Pending',
  unknown: 'Not run',
};

const VARIANT: Record<
  VtestHealth,
  'default' | 'secondary' | 'destructive' | 'outline'
> = {
  pass: 'default',
  fail: 'destructive',
  pending: 'secondary',
  unknown: 'outline',
};

/** Calm roll-up badge for a feature/folder's test health. */
export function HealthBadge({ health }: HealthBadgeProps) {
  return <Badge variant={VARIANT[health]}>{LABEL[health]}</Badge>;
}
