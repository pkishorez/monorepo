import { useEffect, useRef, useState } from 'react';
import { Cause, Effect, Stream } from 'effect';
import type { StoryReport } from 'laymos';
import { useRunEffect } from 'use-effect-ts';
import { useIsFetching, useQuery } from '@tanstack/react-query';
import { Button } from 'kui-toolkit/components/ui/button';
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from 'kui-toolkit/components/ui/empty';
import { toast } from 'kui-toolkit/components/ui/sonner';
import {
  ChevronsUpDownIcon,
  FolderIcon,
  RotateCwIcon,
} from 'kui-toolkit/lucide';
import { scrollbarStyles } from 'kui-toolkit/lib/scrollStyles';
import { cn } from 'kui-toolkit/lib/utils';
import {
  DevtoolsClient,
  useDevtoolsRuntime,
  type DevtoolsRuntime,
} from '../../../client/devtools-rpc/index.js';
import { Laymos as AnalysisExplorer } from '../analysis-explorer/index.js';
import { ProjectManager } from './project-manager';
import { ProjectDialog } from './project-dialog';
import { useProjectStore } from './project-store';

// Laymos wants Effect-returning loaders (streamed straight into its Effect
// pipelines), so run against the runtime's already-built context instead of
// round-tripping through runtime.runPromise into a Promise and back.
function provideRuntime<A, E>(
  runtime: DevtoolsRuntime,
  effect: Effect.Effect<A, E, DevtoolsClient>,
): Effect.Effect<A, E, never> {
  return Effect.flatMap(runtime.contextEffect, (context) =>
    Effect.provide(effect, context),
  );
}

export function Laymos() {
  const runtime = useDevtoolsRuntime();
  const selectedPath = useProjectStore((state) => state.selectedPath);
  const reloadNonce = useProjectStore((state) => state.reloadNonce);
  const storyRun = useStoryRun(runtime, selectedPath);
  const query = useQuery({
    queryKey: ['devtools-analysis', 'laymos', selectedPath],
    enabled: selectedPath !== null,
    retry: false,
    queryFn: () =>
      runtime.runPromise(
        Effect.gen(function* () {
          const client = yield* DevtoolsClient;
          return yield* client.AnalyzeLaymosProject({
            projectPath: selectedPath!,
          });
        }),
      ),
  });
  const storiesQuery = useQuery({
    queryKey: ['devtools-stories', 'laymos', selectedPath],
    enabled: selectedPath !== null,
    retry: false,
    queryFn: () =>
      runtime.runPromise(
        Effect.gen(function* () {
          const client = yield* DevtoolsClient;
          return yield* client.GetLaymosStories({
            projectPath: selectedPath!,
          });
        }),
      ),
  });
  const [baseRef, setBaseRef] = useState('HEAD');
  const changesQuery = useQuery({
    queryKey: ['devtools-changes', 'laymos', selectedPath, baseRef],
    enabled: selectedPath !== null,
    retry: false,
    queryFn: () =>
      runtime.runPromise(
        Effect.gen(function* () {
          const client = yield* DevtoolsClient;
          return yield* client.GetLaymosChanges({
            projectPath: selectedPath!,
            baseRef,
          });
        }),
      ),
  });
  const branchesQuery = useQuery({
    queryKey: ['devtools-branches', 'laymos', selectedPath],
    enabled: selectedPath !== null,
    retry: false,
    queryFn: () =>
      runtime.runPromise(
        Effect.gen(function* () {
          const client = yield* DevtoolsClient;
          return yield* client.GetLaymosBranches({
            projectPath: selectedPath!,
          });
        }),
      ),
  });

  const seenReloadNonce = useRef(reloadNonce);
  useEffect(() => {
    if (seenReloadNonce.current === reloadNonce) return;
    seenReloadNonce.current = reloadNonce;
    void query.refetch();
    void storiesQuery.refetch();
    void changesQuery.refetch();
    storyRun.reset();
  }, [reloadNonce]);

  useEffect(() => {
    if (!changesQuery.error) return;
    toast.warning('Git changes are unavailable', {
      description: messageOf(changesQuery.error),
    });
  }, [changesQuery.error]);

  return (
    <ProjectChrome selectedPath={selectedPath}>
      {query.error ? (
        <AnalysisMessage
          title="Could not analyze project"
          description={messageOf(query.error)}
        />
      ) : query.data ? (
        <AnalysisExplorer
          analysis={query.data}
          changes={changesQuery.error ? undefined : changesQuery.data}
          branches={branchesQuery.error ? undefined : branchesQuery.data}
          baseRef={baseRef}
          onBaseRefChange={setBaseRef}
          loadSourceFiles={(pathPrefixes) =>
            provideRuntime(
              runtime,
              Effect.gen(function* () {
                const client = yield* DevtoolsClient;
                return yield* client.GetLaymosSourceFiles({
                  projectPath: selectedPath!,
                  pathPrefixes,
                });
              }),
            )
          }
          loadFileDiff={(path) =>
            provideRuntime(
              runtime,
              Effect.gen(function* () {
                const client = yield* DevtoolsClient;
                return yield* client.GetLaymosFileDiff({
                  projectPath: selectedPath!,
                  path,
                  baseRef,
                });
              }),
            )
          }
          loadDocumentation={(scope) =>
            provideRuntime(
              runtime,
              Effect.gen(function* () {
                const client = yield* DevtoolsClient;
                return yield* client.GetLaymosDocumentation({
                  projectPath: selectedPath!,
                  scope,
                });
              }),
            )
          }
          stories={
            storiesQuery.data
              ? {
                  tree: storiesQuery.data,
                  reports: storyRun.reports,
                  running: storyRun.running,
                  onRun: storyRun.run,
                }
              : undefined
          }
          className="h-full"
        />
      ) : (
        <AnalysisMessage
          title="Analyzing project"
          description="Laymos is reading the project architecture."
        />
      )}
    </ProjectChrome>
  );
}

type StoryReports = Readonly<Record<string, StoryReport>>;

function useStoryRun(runtime: DevtoolsRuntime, projectPath: string | null) {
  const [reports, setReports] = useState<StoryReports>();
  const [running, setRunning] = useState(false);
  const generationRef = useRef(0);

  useEffect(() => {
    generationRef.current += 1;
    setReports(undefined);
    setRunning(false);
  }, [projectPath, runtime]);

  const runStories = useRunEffect(
    (path: string, generation: number, scope?: string) =>
      Effect.tryPromise({
        try: (signal) =>
          runtime.runPromise(
            Effect.gen(function* () {
              const client = yield* DevtoolsClient;
              yield* client.RunLaymosStories({ projectPath: path, scope }).pipe(
                Stream.runForEach((report) =>
                  Effect.sync(() => {
                    if (generationRef.current !== generation) return;
                    setReports((current) => ({
                      ...current,
                      [report.id]: report,
                    }));
                  }),
                ),
              );
            }),
            { signal },
          ),
        catch: (error) => error,
      }).pipe(
        Effect.catchCause((cause) =>
          Cause.hasInterruptsOnly(cause) || generationRef.current !== generation
            ? Effect.void
            : Effect.sync(() =>
                toast.error('Could not run Laymos stories', {
                  description: messageOf(Cause.squash(cause)),
                }),
              ),
        ),
        Effect.ensuring(
          Effect.sync(() => {
            if (generationRef.current === generation) setRunning(false);
          }),
        ),
      ),
  );

  const run = (scope?: string) => {
    if (projectPath === null || running) return;
    const generation = generationRef.current + 1;
    generationRef.current = generation;
    setReports((current) =>
      scope === undefined
        ? {}
        : Object.fromEntries(
            Object.entries(current ?? {}).filter(
              ([id]) => id !== scope && !id.startsWith(`${scope}/`),
            ),
          ),
    );
    setRunning(true);
    void runStories(projectPath, generation, scope);
  };

  const reset = () => {
    generationRef.current += 1;
    setReports(undefined);
    setRunning(false);
  };

  return { reports, running, run, reset };
}

function ProjectChrome({
  selectedPath,
  children,
}: {
  selectedPath: string | null;
  children: React.ReactNode;
}) {
  const projects = useProjectStore((state) => state.projects);
  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="min-h-0 flex-1">
        {selectedPath ? (
          children
        ) : (
          <div className={`h-full overflow-auto ${scrollbarStyles}`}>
            <div className="mx-auto max-w-2xl space-y-6 p-8">
              {projects.length === 0 ? (
                <AnalysisMessage
                  title="No projects added"
                  description="Add a project to explore its architecture."
                />
              ) : null}
              <ProjectManager />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export function LaymosHeader() {
  const projects = useProjectStore((state) => state.projects);
  const selectedPath = useProjectStore((state) => state.selectedPath);
  const requestReload = useProjectStore((state) => state.requestReload);
  const isReloading =
    useIsFetching({
      predicate: (query) => query.queryKey[1] === 'laymos',
    }) > 0;
  const [dialogOpen, setDialogOpen] = useState(false);
  const selected =
    projects.find((project) => project.path === selectedPath) ?? null;
  const selectedLabel = selected
    ? (selected.label ?? selected.path.split('/').pop() ?? selected.path)
    : null;
  return (
    <div className="flex items-center gap-1">
      <ProjectSwitcher
        label={selectedLabel}
        onClick={() => setDialogOpen(true)}
      />
      {selectedPath ? (
        <Button
          variant="ghost"
          size="icon-sm"
          className="text-muted-foreground hover:text-foreground"
          onClick={requestReload}
          disabled={isReloading}
          title={isReloading ? 'Reloading…' : 'Reload'}
        >
          <RotateCwIcon
            className={cn('size-3.5', isReloading && 'animate-spin')}
          />
        </Button>
      ) : null}
      <ProjectDialog open={dialogOpen} onOpenChange={setDialogOpen} />
    </div>
  );
}

function ProjectSwitcher({
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
        'flex h-8 w-64 items-center gap-2 rounded-md border border-border/60 px-2.5 text-sm transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40',
        label ? 'text-foreground' : 'text-muted-foreground',
      )}
    >
      <FolderIcon className="size-3.5 shrink-0 text-muted-foreground" />
      <span className="min-w-0 flex-1 truncate text-left">
        {label ?? 'Select a project'}
      </span>
      <ChevronsUpDownIcon className="size-3.5 shrink-0 text-muted-foreground" />
    </button>
  );
}

function AnalysisMessage({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="flex h-full items-center justify-center p-8">
      <Empty>
        <EmptyHeader>
          <EmptyTitle>{title}</EmptyTitle>
          <EmptyDescription>{description}</EmptyDescription>
        </EmptyHeader>
      </Empty>
    </div>
  );
}

function messageOf(error: unknown): string {
  if (error && typeof error === 'object') {
    if ('message' in error) return String(error.message);
    if ('reason' in error)
      return `Invalid project path: ${String(error.reason)}`;
  }
  return String(error);
}
