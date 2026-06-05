import {
  CircleAlertIcon,
  CircleCheckIcon,
  CircleHelpIcon,
  CircleMinusIcon,
} from 'lucide-react';

import { cn } from '#lib/utils';

import type { CoverageStatItem, FileStatus } from '../model/file-tree-types';

const statIcons: Record<
  FileStatus,
  { icon: typeof CircleAlertIcon; className: string }
> = {
  violation: { icon: CircleAlertIcon, className: 'text-red-500' },
  orphan: { icon: CircleHelpIcon, className: 'text-yellow-500' },
  covered: { icon: CircleCheckIcon, className: 'text-green-500' },
  ignored: { icon: CircleMinusIcon, className: '' },
};

export function CoverageStats({ stats }: { stats: CoverageStatItem[] }) {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
      {stats.map((stat) => {
        if (stat.hidden) return null;
        const Icon = statIcons[stat.status].icon;
        return (
          <span
            key={stat.key}
            className={cn(
              'flex items-center gap-1',
              stat.muted && 'opacity-40',
            )}
          >
            <Icon className={cn('size-3', statIcons[stat.status].className)} />
            {stat.count} {stat.label}
          </span>
        );
      })}
    </div>
  );
}
