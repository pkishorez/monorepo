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

export function changeEdgeClass(status: ChangeStatus | undefined): string {
  switch (status) {
    case 'added':
      return 'border-s-[3px] border-s-green-500';
    case 'modified':
      return 'border-s-[3px] border-s-amber-500';
    default:
      return '';
  }
}

export function changeSurfaceClass(status: ChangeStatus | undefined): string {
  switch (status) {
    case 'added':
      return 'border-green-500 bg-green-500/10 ring-2 ring-green-500/30';
    case 'modified':
      return 'border-amber-500 bg-amber-500/10 ring-2 ring-amber-500/30';
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
        'shrink-0 rounded-sm px-1.5 py-px text-[9px] font-bold uppercase tracking-wider',
        status === 'added'
          ? 'bg-green-500 text-green-950'
          : 'bg-amber-500 text-amber-950',
        className,
      )}
    >
      {label}
    </span>
  );
}
