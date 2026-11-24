import {
  FileWarningIcon,
  ShieldCheckIcon,
  TriangleAlertIcon,
} from 'lucide-react';

import type { Check } from '../logic/shared/index.js';

/*
 * A Package's Check at the end of its line in a list, in the tree's own
 * broken red: how many Violations its monoverse.json finds, a warning
 * when that file cannot be read, a quiet shield when it finds none.
 * Nothing for a Package without one.
 */
export function CheckMark({ check }: { check: Check | undefined }) {
  if (check === undefined || check._tag === 'Unchecked') return null;
  if (check._tag === 'Invalid') {
    const label = `Its monoverse.json cannot be read: ${check.message}`;
    return (
      <span
        role="img"
        aria-label={label}
        title={label}
        className="outline-tree flex shrink-0"
      >
        <FileWarningIcon className="size-3.5 text-(--outline-broken)" />
      </span>
    );
  }
  const count = check.violations.length;
  if (count === 0) {
    const label = 'Checked by its monoverse.json: no Violations';
    return (
      <span
        role="img"
        aria-label={label}
        title={label}
        className="flex shrink-0"
      >
        <ShieldCheckIcon className="size-3.5 text-muted-foreground/70" />
      </span>
    );
  }
  const label = `${count} ${count === 1 ? 'Violation' : 'Violations'} of its monoverse.json rules`;
  return (
    <span
      role="img"
      aria-label={label}
      title={label}
      className="outline-tree flex shrink-0 items-center gap-0.5 text-xs font-medium text-(--outline-broken) tabular-nums"
    >
      <TriangleAlertIcon className="size-3.5" />
      {count}
    </span>
  );
}
