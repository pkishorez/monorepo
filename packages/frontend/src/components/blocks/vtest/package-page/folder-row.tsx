import { ChevronRightIcon } from 'lucide-react';

import { HealthBadge } from '../health-badge';
import type { VtestFolder } from '../types';

interface FolderRowProps {
  folder: VtestFolder;
  onOpen: (folder: VtestFolder) => void;
}

/** A calm, single-line entry for one folder (feature) in a section. */
export function FolderRow({ folder, onOpen }: FolderRowProps) {
  return (
    <button
      type="button"
      onClick={() => onOpen(folder)}
      className="flex w-full items-center gap-4 rounded-lg border border-border px-4 py-3 text-left transition-colors hover:border-ring"
    >
      <div className="flex-1">
        <span className="font-medium">{folder.name}</span>
        {folder.summary && (
          <p className="mt-0.5 text-sm text-muted-foreground">
            {folder.summary}
          </p>
        )}
      </div>
      {folder.health && <HealthBadge health={folder.health} />}
      <ChevronRightIcon className="size-4 text-muted-foreground" />
    </button>
  );
}
