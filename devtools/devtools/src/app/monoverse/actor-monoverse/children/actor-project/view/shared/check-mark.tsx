import {
  FileWarningIcon,
  ShieldCheckIcon,
  TriangleAlertIcon,
} from 'lucide-react';

import type { Check } from '../../logic/shared/index.js';

const broken = 'text-[oklch(0.56_0.21_27)] dark:text-[oklch(0.7_0.18_24)]';

export function CheckMark({ check }: { check: Check | undefined }) {
  if (check === undefined || check._tag === 'Unchecked') return null;
  if (check._tag === 'Invalid') {
    const label = `Its monoverse.json cannot be read: ${check.message}`;
    return (
      <span role="img" aria-label={label} title={label} className="flex">
        <FileWarningIcon strokeWidth={2} className={`size-3.5 ${broken}`} />
      </span>
    );
  }
  const count = check.violations.length;
  if (count === 0) {
    const label = 'Checked by its monoverse.json: no Violations';
    return (
      <span role="img" aria-label={label} title={label} className="flex">
        <ShieldCheckIcon
          strokeWidth={2}
          className="size-3.5 text-muted-foreground/70"
        />
      </span>
    );
  }
  const label = `${count} ${count === 1 ? 'Violation' : 'Violations'} of its monoverse.json rules`;
  return (
    <span
      role="img"
      aria-label={label}
      title={label}
      className={`flex items-center gap-0.5 text-[11px] font-medium tabular-nums ${broken}`}
    >
      <TriangleAlertIcon strokeWidth={2} className="size-3.5" />
      {count}
    </span>
  );
}
