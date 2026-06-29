import {
  CircleAlertIcon,
  CircleCheckIcon,
  CircleHelpIcon,
  CircleMinusIcon,
} from 'lucide-react';

import { cn } from '#lib/utils';

import type {
  CoverageStatItem,
  FileStatus,
  StatKind,
} from '../model/file-tree-types';

const statIcons: Record<
  StatKind,
  { icon: typeof CircleAlertIcon; className: string }
> = {
  violation: { icon: CircleAlertIcon, className: 'text-red-500' },
  orphan: { icon: CircleHelpIcon, className: 'text-yellow-500' },
  covered: { icon: CircleCheckIcon, className: 'text-green-500' },
  ignored: { icon: CircleMinusIcon, className: '' },
};

/** Violations aren't a file status, so they can't filter the tree. */
function asFileStatus(status: StatKind): FileStatus | null {
  return status === 'violation' ? null : status;
}

export function CoverageStats({
  stats,
  activeStatus,
  onToggleStatus,
}: {
  stats: CoverageStatItem[];
  activeStatus: FileStatus | null;
  onToggleStatus: (status: FileStatus) => void;
}) {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
      {stats.map((stat) => {
        if (stat.hidden) return null;
        const Icon = statIcons[stat.status].icon;
        const fileStatus = asFileStatus(stat.status);
        // A zero-count chip is a no-op (nothing to filter to).
        const canFilter = fileStatus !== null && stat.count > 0;
        const isActive = fileStatus !== null && activeStatus === fileStatus;

        const content = (
          <>
            <Icon className={cn('size-3', statIcons[stat.status].className)} />
            {stat.count} {stat.label}
          </>
        );

        const className = cn(
          'flex items-center gap-1 rounded-md px-1.5 py-0.5 -mx-1.5 -my-0.5',
          stat.muted && 'opacity-40',
          canFilter && 'cursor-pointer hover:bg-muted',
          isActive && 'bg-primary/10 font-medium text-foreground',
        );

        return canFilter ? (
          <button
            key={stat.key}
            type="button"
            aria-pressed={isActive}
            onClick={() => onToggleStatus(fileStatus)}
            className={className}
          >
            {content}
          </button>
        ) : (
          <span key={stat.key} className={cn(className, 'cursor-default')}>
            {content}
          </span>
        );
      })}
    </div>
  );
}
