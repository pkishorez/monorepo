import { useCallback } from 'react';
import { useIsFetching } from '@tanstack/react-query';
import { useNavigate, useSearch } from '@tanstack/react-router';
import { scrollbarStyles } from 'kui-toolkit/lib/scrollStyles';
import { LaymosProjectWorkspace } from '../project-workspace/index.js';
import {
  MissingProjectState,
  ProjectPicker,
  ProjectSelectionHeader,
  isMissingInWorktree,
  useReload,
  useWorktrees,
} from '../../project-selection/index.js';

// The shell keeps this Tool's header mounted while a navigation to another
// Tool is pending; read the search leniently for that render.
function useLaymosSearch() {
  const search = useSearch({ from: '/laymos', shouldThrow: false });
  return search ?? { project: undefined };
}

/**
 * The Laymos Tool. The selected Project lives in the URL (`project`); switching
 * Worktree rewrites it to the Worktree sibling. A bare `/laymos` shows the
 * Project picker.
 */
export function Laymos() {
  const search = useLaymosSearch();
  const navigate = useNavigate();
  const projectPath = search.project ?? null;
  const reload = useReload('laymos');
  const worktrees = useWorktrees(projectPath);

  const selectProject = useCallback(
    (path: string) =>
      void navigate({ to: '/laymos', search: { project: path } }),
    [navigate],
  );

  if (projectPath === null) {
    return (
      <div className={`h-full overflow-auto ${scrollbarStyles}`}>
        <div className="mx-auto max-w-2xl space-y-6 p-4 sm:p-8">
          <ProjectPicker
            tool="laymos"
            currentPath={null}
            onSelect={selectProject}
          />
        </div>
      </div>
    );
  }

  const missing = (
    <MissingProjectState
      noun="project"
      path={projectPath}
      resolution={worktrees.data}
      onSelect={selectProject}
    />
  );

  // Decide where the folder is before mounting the workspace, so a folder
  // absent from this Worktree never fires analysis and git requests.
  if (worktrees.isPending) return null;
  if (isMissingInWorktree(worktrees.data)) return missing;

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="min-h-0 flex-1">
        <LaymosProjectWorkspace
          key={projectPath}
          projectPath={projectPath}
          reloadNonce={reload.nonce}
          // The folder exists in this Worktree but holds no Config: the same
          // message, so the developer can move to a Worktree that has it.
          renderAnalysisError={(error) =>
            worktrees.data && isConfigMissing(error) ? missing : null
          }
        />
      </div>
    </div>
  );
}

function isConfigMissing(error: unknown) {
  if (!error || typeof error !== 'object' || !('_tag' in error)) return false;
  return (
    error._tag === 'ConfigReadError' ||
    (error._tag === 'InvalidProjectPath' &&
      'reason' in error &&
      error.reason === 'not-found')
  );
}

export function LaymosHeader() {
  const search = useLaymosSearch();
  const navigate = useNavigate();
  const isReloading =
    useIsFetching({
      predicate: (query) => query.queryKey[1] === 'laymos',
    }) > 0;
  return (
    <ProjectSelectionHeader
      tool="laymos"
      path={search.project ?? null}
      reloading={isReloading}
      onSelect={(path) =>
        void navigate({ to: '/laymos', search: { project: path } })
      }
    />
  );
}
