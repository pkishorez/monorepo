import { useState } from 'react';
import { Button } from '@kstackz/web-platform/components/button';
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from '@kstackz/web-platform/components/empty';
import { PencilIcon } from '@kstackz/web-platform/components/lucide';
import type { WorktreeResolution } from '../../rpc/index.js';
import { ManageEntryDialog } from './manage-entry.js';
import { basename, findEntryForPath, useProjectRegistry } from './registry.js';

/**
 * Shown in place of the analysis when the current checkout does not hold the
 * folder. Edit opens the entry's Manage dialog, where its path can be fixed
 * or another Worktree opened.
 */
export function MissingProjectState({
  path,
  resolution,
  onSelect,
}: {
  path: string;
  resolution: WorktreeResolution | null | undefined;
  onSelect: (path: string) => void;
}) {
  const registry = useProjectRegistry();
  const entry = findEntryForPath(registry.query.data, path);
  const [editing, setEditing] = useState(false);
  const folder = resolution?.repositoryPath || basename(path);

  return (
    <div className="flex h-full items-center justify-center p-8">
      <Empty>
        <EmptyHeader>
          <EmptyTitle>This checkout doesn't contain {folder}.</EmptyTitle>
          <EmptyDescription className="font-mono text-xs break-all">
            {path}
          </EmptyDescription>
          <EmptyDescription>
            Edit the entry to point at the right folder.
          </EmptyDescription>
        </EmptyHeader>
        {entry ? (
          <EmptyContent>
            <Button
              type="button"
              variant="outline"
              className="min-h-11 sm:min-h-0"
              onClick={() => setEditing(true)}
            >
              <PencilIcon className="size-4" />
              Edit
            </Button>
          </EmptyContent>
        ) : null}
      </Empty>
      <ManageEntryDialog
        entry={editing ? entry : null}
        currentPath={path}
        onClose={() => setEditing(false)}
        onSelect={onSelect}
      />
    </div>
  );
}
