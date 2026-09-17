import { useCallback, useState } from 'react';
import { Effect } from 'effect';
import { useNavigate, useSearch } from '@tanstack/react-router';
import { scrollbarStyles } from 'kui-toolkit/lib/scrollStyles';
import { Monoverse as MonorepoExplorer } from 'kui-toolkit/components/blocks/monoverse';
import {
  DevtoolsClient,
  useDevtoolsRuntime,
  type DevtoolsRuntime,
} from '../../../client/devtools-rpc/index.js';
import { LaymosProjectWorkspace } from '../../laymos/project-workspace/index.js';
import {
  MissingProjectState,
  ProjectPicker,
  ProjectSelectionHeader,
  isMissingInWorktree,
  useReload,
  useWorktrees,
} from '../../project-selection/index.js';

// The block wants an Effect-returning loader, so run against the runtime's
// already-built context instead of round-tripping through a Promise.
function provideRuntime<A, E>(
  runtime: DevtoolsRuntime,
  effect: Effect.Effect<A, E, DevtoolsClient>,
): Effect.Effect<A, E, never> {
  return Effect.flatMap(runtime.contextEffect, (context) =>
    Effect.provide(effect, context),
  );
}

type SearchPatch = Partial<{
  monorepo: string | undefined;
  package: string | undefined;
  laymos: string | undefined;
}>;

// The shell keeps this Tool's header mounted while a navigation to another
// Tool is pending, so the route may not be the active match for one render.
// Read the search leniently and treat that render as an empty search.
function useMonoverseSearch() {
  const search = useSearch({ from: '/monoverse', shouldThrow: false });
  return (
    search ?? { monorepo: undefined, package: undefined, laymos: undefined }
  );
}

/**
 * The Monoverse Tool. The Monorepo, the selected Package, and the Package open
 * in Embedded Laymos all live in the URL (`monorepo`, `package`, `laymos`).
 * Switching Worktree rewrites `monorepo` to the Worktree sibling; nothing is
 * remembered outside the URL. A bare `/monoverse` shows the Project picker.
 */
export function Monoverse() {
  const runtime = useDevtoolsRuntime();
  const search = useMonoverseSearch();
  const navigate = useNavigate();
  const monorepoPath = search.monorepo ?? null;
  const reload = useReload('monoverse');
  const worktrees = useWorktrees(monorepoPath);

  const selectMonorepo = useCallback(
    (path: string) =>
      void navigate({
        to: '/monoverse',
        search: { monorepo: path, package: undefined, laymos: undefined },
      }),
    [navigate],
  );

  const setSearch = useCallback(
    (patch: SearchPatch) =>
      void navigate({
        to: '/monoverse',
        search: { ...search, ...patch },
      }),
    [navigate, search],
  );

  if (monorepoPath === null) {
    return (
      <div className={`h-full overflow-auto ${scrollbarStyles}`}>
        <div className="mx-auto max-w-2xl space-y-6 p-4 sm:p-8">
          <ProjectPicker
            tool="monoverse"
            currentPath={null}
            onSelect={selectMonorepo}
          />
        </div>
      </div>
    );
  }

  // Decide where the folder is before mounting the explorer.
  if (worktrees.isPending) return null;
  if (isMissingInWorktree(worktrees.data)) {
    return (
      <MissingProjectState
        noun="monorepo"
        path={monorepoPath}
        resolution={worktrees.data}
        onSelect={selectMonorepo}
      />
    );
  }

  return (
    <MonorepoView
      key={monorepoPath}
      runtime={runtime}
      monorepoPath={monorepoPath}
      reloadNonce={reload.nonce}
      search={search}
      setSearch={setSearch}
      onSelectMonorepo={selectMonorepo}
    />
  );
}

function MonorepoView({
  runtime,
  monorepoPath,
  reloadNonce,
  search,
  setSearch,
  onSelectMonorepo,
}: {
  runtime: DevtoolsRuntime;
  monorepoPath: string;
  reloadNonce: number;
  search: ReturnType<typeof useMonoverseSearch>;
  setSearch: (patch: SearchPatch) => void;
  onSelectMonorepo: (path: string) => void;
}) {
  const worktrees = useWorktrees(monorepoPath);
  // A Worktree may hold the folder but not the workspace file: from the
  // developer's view the Monorepo is not there either.
  const [notWorkspace, setNotWorkspace] = useState(false);

  const loadAnalysis = useCallback(
    () =>
      provideRuntime(
        runtime,
        Effect.gen(function* () {
          const client = yield* DevtoolsClient;
          return yield* client.AnalyzeMonorepo({ monorepoPath });
        }).pipe(
          Effect.tap(() => Effect.sync(() => setNotWorkspace(false))),
          Effect.tapError((error) =>
            Effect.sync(() =>
              setNotWorkspace(error._tag === 'NotPnpmWorkspaceError'),
            ),
          ),
          // Transport failures carry structured reasons; the block wants text.
          Effect.mapError((error) =>
            error._tag === 'RpcClientError'
              ? { _tag: error._tag, message: error.message }
              : error,
          ),
        ),
      ),
    [runtime, monorepoPath],
  );

  if (notWorkspace && worktrees.data) {
    return (
      <MissingProjectState
        noun="monorepo"
        path={monorepoPath}
        resolution={worktrees.data}
        onSelect={onSelectMonorepo}
      />
    );
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="min-h-0 flex-1">
        <MonorepoExplorer
          monorepoPath={monorepoPath}
          loadAnalysis={loadAnalysis}
          reloadNonce={reloadNonce}
          renderLaymos={({ projectPath }) => (
            <LaymosProjectWorkspace
              projectPath={projectPath}
              reloadNonce={reloadNonce}
            />
          )}
          selectedPackage={search.package ?? null}
          onSelectedPackageChange={(name) =>
            setSearch({ package: name ?? undefined })
          }
          openPackage={search.laymos ?? null}
          onOpenPackageChange={(name) =>
            setSearch({ laymos: name ?? undefined })
          }
          className="h-full"
        />
      </div>
    </div>
  );
}

export function MonoverseHeader() {
  const search = useMonoverseSearch();
  const navigate = useNavigate();
  return (
    <ProjectSelectionHeader
      tool="monoverse"
      path={search.monorepo ?? null}
      onSelect={(path) =>
        void navigate({
          to: '/monoverse',
          search: { monorepo: path, package: undefined, laymos: undefined },
        })
      }
    />
  );
}
