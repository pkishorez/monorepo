import { cn } from '#lib/utils';

import type { ChangeStatus } from './modules/model';

const changeLabels: Readonly<Record<ChangeStatus, string>> = {
  added: 'New',
  modified: 'Modified',
};

const changeShortLabels: Readonly<Record<ChangeStatus, string>> = {
  added: 'new',
  modified: 'mod',
};

export function changeSurfaceClass(status: ChangeStatus | undefined): string {
  switch (status) {
    case 'added':
      return 'border-green-500 ring-1 ring-green-500/40';
    case 'modified':
      return 'border-amber-500 ring-1 ring-amber-500/40';
    default:
      return '';
  }
}

export function ChangeBadge({
  status,
  label = changeShortLabels[status],
  className,
}: {
  readonly status: ChangeStatus;
  readonly label?: string;
  readonly className?: string;
}) {
  return (
    <span
      title={changeLabels[status]}
      className={cn(
        'shrink-0 rounded-sm border px-1 py-px text-[9px] font-semibold uppercase tracking-wider',
        status === 'added'
          ? 'border-green-500/60 text-green-600 dark:text-green-400'
          : 'border-amber-500/60 text-amber-600 dark:text-amber-400',
        className,
      )}
    >
      {label}
    </span>
  );
}
