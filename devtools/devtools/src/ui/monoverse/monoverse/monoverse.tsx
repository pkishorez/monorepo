import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Effect } from 'effect';
import { useNavigate, useSearch } from '@tanstack/react-router';
import { scrollbarStyles } from 'kui-toolkit/lib/scrollStyles';
import {
  Monoverse as MonorepoExplorer,
  type Package,
  type PackageReadmeDocument,
  type PackageReadmeDocuments,
} from 'kui-toolkit/components/blocks/monoverse';
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
  package: string | undefined;
  laymos: string | undefined;
  readme: readonly string[] | undefined;
}>;

const packageReadmePath = 'README.md';
const noReadmeStack: readonly string[] = [];

// The shell keeps this Tool's header mounted while a navigation to another
// Tool is pending, so the route may not be the active match for one render.
// Read the search leniently and treat that render as an empty search.
function useMonoverseSearch() {
  const search = useSearch({ from: '/monoverse', shouldThrow: false });
  return (
    search ?? {
      monorepo: undefined,
      package: undefined,
      laymos: undefined,
      readme: undefined,
    }
  );
}

/**
 * The Monoverse Tool. The Monorepo, the selected Package, the Package open
 * in Embedded Laymos, and the Package README stack all live in the URL
 * (`monorepo`, `package`, `laymos`, `readme`). Switching Worktree rewrites
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
        search: {
          monorepo: path,
          package: undefined,
          laymos: undefined,
          readme: undefined,
        },
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
  // A Worktree may hold the folder but not the workspace file: from the
  // developer's view the Monorepo is not there either.
  const [notWorkspaceAt, setNotWorkspaceAt] = useState<number | null>(null);
  // The route needs Package paths to read READMEs; the block owns the rest.
  const [packages, setPackages] = useState<readonly Package[]>([]);
  const readmeStack = search.readme ?? noReadmeStack;
  const readmeDocuments = usePackageReadmes(
    runtime,
    monorepoPath,
    packages.find((pkg) => pkg.name === search.package)?.path ?? null,
    readmeStack,
    reloadNonce,
  );

  const loadAnalysis = useCallback(
    () =>
      provideRuntime(
        runtime,
        Effect.gen(function* () {
          const client = yield* DevtoolsClient;
          return yield* client.AnalyzeMonorepo({ monorepoPath });
        }).pipe(
          Effect.tap((analysis) =>
            Effect.sync(() => {
              setNotWorkspaceAt(null);
              setPackages(analysis.packages);
            }),
          ),
          Effect.tapError((error) =>
            Effect.sync(() =>
              setNotWorkspaceAt(
                error._tag === 'NotPnpmWorkspaceError' ? reloadNonce : null,
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

  const loadPackageFiles = useCallback(
    (pkg: Package) =>
      provideRuntime(
        runtime,
        Effect.gen(function* () {
          const client = yield* DevtoolsClient;
          return yield* client.GetPackageFiles({
            monorepoRoot: monorepoPath,
            packagePath: pkg.path,
          });
        }),
      ),
    [runtime, monorepoPath],
  );

  if (notWorkspaceAt === reloadNonce && worktrees.data) {
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
          selectedPackage={search.package ?? null}
          onSelectedPackageChange={(name) =>
            setSearch({ package: name ?? undefined })
          }
          openPackage={search.laymos ?? null}
          onOpenPackageChange={(name) =>
            setSearch({ laymos: name ?? undefined })
          }
          readmeStack={readmeStack}
          onReadmeStackChange={(stack) =>
            setSearch({ readme: stack.length === 0 ? undefined : stack })
          }
          onOpenReadme={(name) =>
            setSearch({ package: name, readme: [packageReadmePath] })
          }
          readmeDocuments={readmeDocuments}
          loadPackageFiles={loadPackageFiles}
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

// Loads every markdown file in the README stack of the selected Package once
// per Package and Monorepo reload. Results are keyed by that scope, so a stale
// response can never land in a newer scope.
function usePackageReadmes(
  runtime: DevtoolsRuntime,
  monorepoRoot: string,
  packagePath: string | null,
  stack: readonly string[],
  reloadNonce: number,
): PackageReadmeDocuments {
  const scope = `${packagePath ?? ''}\n${reloadNonce}\n`;
  const [loaded, setLoaded] = useState<PackageReadmeDocuments>({});
  const requested = useRef(new Set<string>());

  useEffect(() => {
    if (packagePath === null) return;
    for (const relativePath of stack) {
      const key = scope + relativePath;
      if (requested.current.has(key)) continue;
      requested.current.add(key);
      void Effect.runPromise(
        provideRuntime(
          runtime,
          Effect.gen(function* () {
            const client = yield* DevtoolsClient;
            return yield* client.GetPackageReadme({
              monorepoRoot,
              packagePath,
              relativePath,
            });
          }).pipe(
            Effect.match({
              onSuccess: (readme): PackageReadmeDocument => ({
                kind: 'ready',
                markdown: readme.markdown,
              }),
              onFailure: (error): PackageReadmeDocument =>
                error._tag === 'PackageReadmeNotFoundError'
                  ? { kind: 'missing' }
                  : { kind: 'failure', message: error.message || error._tag },
            }),
          ),
        ),
      ).then((document) => setLoaded((all) => ({ ...all, [key]: document })));
    }
  }, [runtime, monorepoRoot, packagePath, stack, scope]);

  return useMemo(
    () =>
      Object.fromEntries(
        stack.flatMap((path) => {
          const document = loaded[scope + path];
          return document === undefined ? [] : [[path, document]];
        }),
      ),
    [loaded, scope, stack],
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
          search: {
            monorepo: path,
            package: undefined,
            laymos: undefined,
            readme: undefined,
          },
        })
      }
    />
  );
}
