import { useCallback, useState } from 'react';
import { Effect } from 'effect';
import { useNavigate, useSearch } from '@tanstack/react-router';
import { scrollbarStyles } from '@kstackz/web-platform/components/scroll-styles';
import { Monoverse as MonorepoExplorer } from '@devtools/ui/monoverse';
import {
  DevtoolsClient,
  useDevtoolsRuntime,
  type DevtoolsRuntime,
} from '../../../client/devtools-rpc/index.js';
import { useGitChanges } from '../../git-changes/index.js';
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
  laymos: string | undefined;
}>;

// The shell keeps this Tool's header mounted while a navigation to another
// Tool is pending, so the route may not be the active match for one render.
// Read the search leniently and treat that render as an empty search.
function useMonoverseSearch() {
  const search = useSearch({ from: '/monoverse', shouldThrow: false });
  return (
    search ?? {
      monorepo: undefined,
      laymos: undefined,
    }
  );
}

/**
 * The Monoverse Tool. The Monorepo and the Package open in Embedded Laymos
 * live in the URL (`monorepo`, `laymos`). Switching Worktree rewrites
 * `monorepo` to the Worktree sibling; nothing is remembered outside the URL.
 * A bare `/monoverse` shows the Project picker.
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
        search: { monorepo: path, laymos: undefined },
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
  // One Base ref for the whole view; Embedded Laymos is measured against it.
  const git = useGitChanges(monorepoPath, { reloadNonce, knownFiles: true });
  // A Worktree may hold the folder but not the file listing its workspace
  // globs: from the developer's view the Monorepo is not there either.
  const [notMonorepoAt, setNotMonorepoAt] = useState<number | null>(null);

  const loadAnalysis = useCallback(
    () =>
      provideRuntime(
        runtime,
        Effect.gen(function* () {
          const client = yield* DevtoolsClient;
          return yield* client.AnalyzeMonorepo({ monorepoPath });
        }).pipe(
          Effect.tap(() => Effect.sync(() => setNotMonorepoAt(null))),
          Effect.tapError((error) =>
            Effect.sync(() =>
              setNotMonorepoAt(
                error._tag === 'NotAMonorepoError' ? reloadNonce : null,
              ),
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
    [runtime, monorepoPath, reloadNonce],
  );

  const loadFile = useCallback(
    (path: string) =>
      provideRuntime(
        runtime,
        Effect.gen(function* () {
          const client = yield* DevtoolsClient;
          return yield* client.GetMonorepoFile({
            monorepoRoot: monorepoPath,
            path,
          });
        }),
      ),
    [runtime, monorepoPath],
  );

  if (notMonorepoAt === reloadNonce && worktrees.data) {
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
              baseRef={git.baseRef}
              onBaseRefChange={git.setBaseRef}
            />
          )}
          openPackage={search.laymos ?? null}
          onOpenPackageChange={(name) =>
            setSearch({ laymos: name ?? undefined })
          }
          loadFile={loadFile}
          changes={git.changes}
          knownFiles={git.knownFiles}
          branches={git.branches}
          baseRef={git.baseRef}
          onBaseRefChange={git.setBaseRef}
          loadFileDiff={git.loadFileDiff}
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
          search: { monorepo: path, laymos: undefined },
        })
      }
    />
  );
}
