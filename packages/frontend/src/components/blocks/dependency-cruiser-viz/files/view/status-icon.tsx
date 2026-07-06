import {
  CircleCheckIcon,
  CircleHelpIcon,
  CircleMinusIcon,
  FileIcon,
} from 'lucide-react';

import { cn } from '#lib/utils';

import type { FileStatus } from '../model/file-tree-types';

const statusIcons: Record<
  FileStatus,
  { icon: typeof FileIcon; className: string }
> = {
  orphan: { icon: CircleHelpIcon, className: 'text-yellow-500' },
  covered: {
    icon: CircleCheckIcon,
    className: 'text-muted-foreground',
  },
  ignored: {
    icon: CircleMinusIcon,
    className: 'text-muted-foreground/40',
  },
};

export function StatusIcon({
  status,
  accentClassName,
}: {
  status?: FileStatus;
  /** Overrides the status color — used to tint a single-file module's icon. */
  accentClassName?: string;
}) {
  if (!status)
    return (
      <FileIcon
        className={cn('size-4', accentClassName ?? 'text-muted-foreground')}
      />
    );
  const cfg = statusIcons[status];
  const Icon = cfg.icon;
  return <Icon className={cn('size-4', accentClassName ?? cfg.className)} />;
}
