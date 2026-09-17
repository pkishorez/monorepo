import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from 'kui-toolkit/components/ui/empty';
import type { WorktreeResolution } from '../../rpc/index.js';
import { currentWorktree } from './registry.js';
import { WorktreeSwitcher, worktreeLabel } from './worktree-switcher.js';

/**
 * Shown in place of the analysis when the selected Worktree does not contain
 * the Project. The switcher is repeated here so the fix is one click away.
 */
export function MissingProjectState({
  noun,
  path,
  resolution,
  onSelect,
}: {
  noun: string;
  path: string;
  resolution: WorktreeResolution | null | undefined;
  onSelect: (siblingPath: string) => void;
}) {
  const current = currentWorktree(resolution);
  return (
    <div className="flex h-full items-center justify-center p-8">
      <Empty>
        <EmptyHeader>
          <EmptyTitle>
            {current
              ? `The ${worktreeLabel(current)} worktree does not contain this ${noun}`
              : `This ${noun} is not available here`}
          </EmptyTitle>
          <EmptyDescription className="font-mono text-xs break-all">
            {path}
          </EmptyDescription>
          <EmptyDescription>
            Switch to a worktree that has it, or fix the path in the project
            list.
          </EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <WorktreeSwitcher resolution={resolution} onSelect={onSelect} />
        </EmptyContent>
      </Empty>
    </div>
  );
}
