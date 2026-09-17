import { useCallback, useEffect, useState } from 'react';
import { Effect } from 'effect';
import { useNavigate, useSearch } from '@tanstack/react-router';
import { Button } from 'kui-toolkit/components/ui/button';
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from 'kui-toolkit/components/ui/empty';
import {
  ChevronsUpDownIcon,
  FolderIcon,
  RotateCwIcon,
} from 'kui-toolkit/lucide';
import { scrollbarStyles } from 'kui-toolkit/lib/scrollStyles';
import { cn } from 'kui-toolkit/lib/utils';
import { Monoverse as MonorepoExplorer } from 'kui-toolkit/components/blocks/monoverse';
import {
  DevtoolsClient,
  useDevtoolsRuntime,
  type DevtoolsRuntime,
} from '../../../client/devtools-rpc/index.js';
import { LaymosProjectWorkspace } from '../../laymos/project-workspace/index.js';
import { MonorepoDialog } from './monorepo-dialog';
import { MonorepoManager } from './monorepo-manager';
import { useMonorepoStore } from './monorepo-store';

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
 * in Embedded Laymos all live in the URL (`monorepo`, `package`, `laymos`), so
 * they survive reloads and browser Back closes Embedded Laymos. The Monorepo
 * store remembers the last Monorepo for a bare `/monoverse`.
 */
export function Monoverse() {
  const runtime = useDevtoolsRuntime();
  const search = useMonoverseSearch();
  const navigate = useNavigate();
  const storedPath = useMonorepoStore((state) => state.selectedPath);
  const selectMonorepo = useMonorepoStore((state) => state.selectMonorepo);
  const monorepos = useMonorepoStore((state) => state.monorepos);
  const reloadNonce = useMonorepoStore((state) => state.reloadNonce);
  const monorepoPath = search.monorepo ?? storedPath;

  // A Monorepo arriving by URL becomes the remembered one.
  useEffect(() => {
    if (search.monorepo !== undefined && search.monorepo !== storedPath) {
      selectMonorepo(search.monorepo);
    }
  }, [search.monorepo, storedPath, selectMonorepo]);

  const setSearch = useCallback(
    (patch: SearchPatch) =>
      void navigate({
        to: '/monoverse',
        search: { ...search, ...patch },
      }),
    [navigate, search],
  );

  const loadAnalysis = useCallback(
    () =>
      provideRuntime(
        runtime,
        Effect.gen(function* () {
          const client = yield* DevtoolsClient;
          return yield* client.AnalyzeMonorepo({ monorepoPath: monorepoPath! });
        }).pipe(
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

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="min-h-0 flex-1">
        {monorepoPath ? (
          <MonorepoExplorer
            key={monorepoPath}
            monorepoPath={monorepoPath}
            loadAnalysis={loadAnalysis}
            reloadNonce={reloadNonce}
            renderLaymos={({ projectPath }) => (
              <LaymosProjectWorkspace projectPath={projectPath} />
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
        ) : (
          <div className={`h-full overflow-auto ${scrollbarStyles}`}>
            <div className="mx-auto max-w-2xl space-y-6 p-4 sm:p-8">
              {monorepos.length === 0 ? (
                <div className="flex h-full items-center justify-center p-8">
                  <Empty>
                    <EmptyHeader>
                      <EmptyTitle>No monorepos added</EmptyTitle>
                      <EmptyDescription>
                        Add a pnpm monorepo to explore its packages.
                      </EmptyDescription>
                    </EmptyHeader>
                  </Empty>
                </div>
              ) : null}
              <MonorepoManager
                onSelected={(path) =>
                  setSearch({
                    monorepo: path,
                    package: undefined,
                    laymos: undefined,
                  })
                }
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export function MonoverseHeader() {
  const search = useMonoverseSearch();
  const navigate = useNavigate();
  const monorepos = useMonorepoStore((state) => state.monorepos);
  const storedPath = useMonorepoStore((state) => state.selectedPath);
  const requestReload = useMonorepoStore((state) => state.requestReload);
  const [dialogOpen, setDialogOpen] = useState(false);
  const monorepoPath = search.monorepo ?? storedPath;
  const selected =
    monorepos.find((monorepo) => monorepo.path === monorepoPath) ?? null;
  const selectedLabel = selected
    ? (selected.label ?? selected.path.split('/').pop() ?? selected.path)
    : (monorepoPath?.split('/').pop() ?? null);
  return (
    <div className="flex min-w-0 items-center gap-1">
      <MonorepoSwitcher
        label={selectedLabel}
        onClick={() => setDialogOpen(true)}
      />
      {monorepoPath ? (
        <Button
          variant="ghost"
          size="icon-sm"
          className="size-10 shrink-0 text-muted-foreground hover:text-foreground md:size-8"
          onClick={requestReload}
          aria-label="Reload monorepo"
          title="Reload"
        >
          <RotateCwIcon className="size-3.5" />
        </Button>
      ) : null}
      <MonorepoDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onSelected={(path) =>
          void navigate({
            to: '/monoverse',
            search: { monorepo: path, package: undefined, laymos: undefined },
          })
        }
      />
    </div>
  );
}

function MonorepoSwitcher({
  label,
  onClick,
}: {
  label: string | null;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex h-10 min-w-0 max-w-64 flex-1 items-center gap-2 rounded-md border border-border/60 px-2.5 text-sm transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 md:h-8 md:w-64',
        label ? 'text-foreground' : 'text-muted-foreground',
      )}
    >
      <FolderIcon className="size-3.5 shrink-0 text-muted-foreground" />
      <span className="min-w-0 flex-1 truncate text-left">
        {label ?? 'Select a monorepo'}
      </span>
      <ChevronsUpDownIcon className="size-3.5 shrink-0 text-muted-foreground" />
    </button>
  );
}
