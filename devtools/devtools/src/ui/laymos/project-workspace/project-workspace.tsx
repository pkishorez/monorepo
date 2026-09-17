import { useEffect, useRef, useState } from 'react';
import { Cause, Effect, Stream } from 'effect';
import type { StoryReport } from 'laymos';
import { useRunEffect } from 'use-effect-ts';
import { useQuery } from '@tanstack/react-query';
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from 'kui-toolkit/components/ui/empty';
import { toast } from 'kui-toolkit/components/ui/sonner';
import { Laymos as AnalysisExplorer } from 'kui-toolkit/components/blocks/laymos';
import {
  DevtoolsClient,
  useDevtoolsRuntime,
  type DevtoolsRuntime,
} from '../../../client/devtools-rpc/index.js';

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

/**
 * The full Laymos view of one Project: analysis, changes against a Base ref,
 * Stories, and source. The Laymos Tool renders it for its selected Project;
 * Monoverse renders it as Embedded Laymos over its canvas. `reloadNonce`
 * changing refetches everything and drops Story reports.
 */
export function LaymosProjectWorkspace({
  projectPath,
  reloadNonce = 0,
  className,
}: {
  projectPath: string;
  reloadNonce?: number;
  className?: string;
}) {
  const runtime = useDevtoolsRuntime();
  const storyRun = useStoryRun(runtime, projectPath);
  const query = useQuery({
    queryKey: ['devtools-analysis', 'laymos', projectPath],
    retry: false,
    queryFn: () =>
      runtime.runPromise(
        Effect.gen(function* () {
          const client = yield* DevtoolsClient;
          return yield* client.AnalyzeLaymosProject({ projectPath });
        }),
      ),
  });
  const storiesQuery = useQuery({
    queryKey: ['devtools-stories', 'laymos', projectPath],
    retry: false,
    queryFn: () =>
      runtime.runPromise(
        Effect.gen(function* () {
          const client = yield* DevtoolsClient;
          return yield* client.GetLaymosStories({ projectPath });
        }),
      ),
  });
  const [baseRef, setBaseRef] = useState('HEAD');
  const changesQuery = useQuery({
    queryKey: ['devtools-changes', 'laymos', projectPath, baseRef],
    retry: false,
    queryFn: () =>
      runtime.runPromise(
        Effect.gen(function* () {
          const client = yield* DevtoolsClient;
          return yield* client.GetLaymosChanges({ projectPath, baseRef });
        }),
      ),
  });
  const branchesQuery = useQuery({
    queryKey: ['devtools-branches', 'laymos', projectPath],
    retry: false,
    queryFn: () =>
      runtime.runPromise(
        Effect.gen(function* () {
          const client = yield* DevtoolsClient;
          return yield* client.GetLaymosBranches({ projectPath });
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

  if (query.error) {
    return (
      <AnalysisMessage
        title="Could not analyze project"
        description={messageOf(query.error)}
      />
    );
  }
  if (!query.data) {
    return (
      <AnalysisMessage
        title="Analyzing project"
        description="Laymos is reading the project architecture."
      />
    );
  }
  return (
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
              projectPath,
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
              projectPath,
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
              projectPath,
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
      className={className ?? 'h-full'}
    />
  );
}

type StoryReports = Readonly<Record<string, StoryReport>>;

function useStoryRun(runtime: DevtoolsRuntime, projectPath: string) {
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
    if (running) return;
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
