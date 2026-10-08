import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { Cause, Effect, Stream } from 'effect';
import type { ProofReport } from 'laymos/story/schema';
import { useRunEffect } from 'use-effect-ts';
import { useQuery } from '@tanstack/react-query';
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from '@kstackz/web-platform/components/empty';
import { toast } from '@kstackz/web-platform/components/sonner';
import { Laymos as AnalysisExplorer } from '@devtools/ui/laymos';
import {
  DevtoolsClient,
  useDevtoolsRuntime,
  type DevtoolsRuntime,
} from '../../../client/devtools-rpc/index.js';
import { useGitChanges } from '../../git-changes/index.js';

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
 * changing refetches everything, saved Story reports included. A host that shares
 * its Base ref, as Monoverse does, passes it in.
 */
export function LaymosProjectWorkspace({
  projectPath,
  reloadNonce = 0,
  baseRef: hostBaseRef,
  onBaseRefChange,
  className,
  renderAnalysisError,
}: {
  projectPath: string;
  reloadNonce?: number;
  baseRef?: string;
  onBaseRefChange?: (baseRef: string) => void;
  className?: string;
  /** Replaces the default analysis error view; return null to keep it. */
  renderAnalysisError?: (error: unknown) => ReactNode | null;
}) {
  const runtime = useDevtoolsRuntime();
  const storyRun = useStoryRun(runtime, projectPath, reloadNonce);
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
  const git = useGitChanges(projectPath, {
    reloadNonce,
    baseRef: hostBaseRef,
    onBaseRefChange,
  });

  const seenReloadNonce = useRef(reloadNonce);
  useEffect(() => {
    if (seenReloadNonce.current === reloadNonce) return;
    seenReloadNonce.current = reloadNonce;
    void query.refetch();
    void storiesQuery.refetch();
  }, [reloadNonce]);

  if (query.error) {
    const custom = renderAnalysisError?.(query.error);
    if (custom) return <>{custom}</>;
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
      changes={git.changes}
      branches={git.branches}
      baseRef={git.baseRef}
      onBaseRefChange={git.setBaseRef}
      loadFileList={(modulePath) =>
        provideRuntime(
          runtime,
          Effect.gen(function* () {
            const client = yield* DevtoolsClient;
            return yield* client.GetLaymosFileList({ projectPath, modulePath });
          }),
        )
      }
      loadFileContent={(path) =>
        provideRuntime(
          runtime,
          Effect.gen(function* () {
            const client = yield* DevtoolsClient;
            return yield* client.GetLaymosFile({ projectPath, path });
          }),
        )
      }
      loadFileDiff={git.loadFileDiff}
      stories={
        storiesQuery.data
          ? {
              tree: storiesQuery.data,
              reports: storyRun.reports,
              running: storyRun.running,
              onRun: storyRun.run,
              evidenceUrl: storyRun.evidenceUrl,
            }
          : undefined
      }
      className={className ?? 'h-full'}
    />
  );
}

type ProofReports = Readonly<Record<string, ProofReport>>;

/**
 * Story reports for one Project: the saved ones on mount and reload, then
 * each run's reports as they finish, a rerun replacing a Story's report.
 */
function useStoryRun(
  runtime: DevtoolsRuntime,
  projectPath: string,
  reloadNonce: number,
) {
  const [reports, setReports] = useState<ProofReports>({});
  const [running, setRunning] = useState<ReadonlySet<string>>(new Set());
  const generationRef = useRef(0);

  const loadReports = useRunEffect((path: string, generation: number) =>
    Effect.gen(function* () {
      const client = yield* DevtoolsClient;
      return yield* client.GetLaymosStoryReports({ projectPath: path });
    }).pipe(
      (effect) => provideRuntime(runtime, effect),
      Effect.tap((saved) =>
        Effect.sync(() => {
          if (generationRef.current !== generation) return;
          setReports((current) => ({
            ...Object.fromEntries(saved.map((report) => [report.id, report])),
            ...current,
          }));
        }),
      ),
      // Saved reports only spare a rerun: without them the Stories simply
      // show as not yet run, so a failure to read them says nothing.
      Effect.catchCause(() => Effect.void),
    ),
  );

  useEffect(() => {
    generationRef.current += 1;
    setReports({});
    setRunning(new Set());
    void loadReports(projectPath, generationRef.current);
  }, [projectPath, runtime, reloadNonce]);

  const settle = (id: string) =>
    setRunning((current) => {
      if (!current.has(id)) return current;
      const next = new Set(current);
      next.delete(id);
      return next;
    });

  const runStories = useRunEffect(
    (
      path: string,
      generation: number,
      scope: string | undefined,
      ended: () => void,
    ) => {
      const started = new Set<string>();
      return Effect.gen(function* () {
        const client = yield* DevtoolsClient;
        yield* client.RunLaymosStories({ projectPath: path, scope }).pipe(
          Stream.runForEach((event) =>
            Effect.sync(() => {
              if (generationRef.current !== generation) return;
              if (event._tag === 'Started') {
                started.add(event.id);
                setRunning((current) => new Set(current).add(event.id));
                return;
              }
              started.delete(event.report.id);
              setReports((current) => ({
                ...current,
                [event.report.id]: event.report,
              }));
              settle(event.report.id);
            }),
          ),
        );
      }).pipe(
        (effect) => provideRuntime(runtime, effect),
        Effect.catchCause((cause) =>
          Cause.hasInterruptsOnly(cause) || generationRef.current !== generation
            ? Effect.void
            : Effect.sync(() =>
                toast.error('Could not run Laymos Stories', {
                  description: messageOf(Cause.squash(cause)),
                }),
              ),
        ),
        Effect.ensuring(
          Effect.sync(() => {
            if (generationRef.current === generation) started.forEach(settle);
            ended();
          }),
        ),
      );
    },
  );

  /** Settles when the run ends, finished, failed or interrupted. */
  const run = (scope?: string) =>
    new Promise<void>((resolve) => {
      void runStories(projectPath, generationRef.current, scope, resolve);
    });

  const evidenceUrl = useCallback(
    (proofId: string, file: string) => {
      const query = new URLSearchParams({
        project: projectPath,
        proof: proofId,
        file,
      });
      return `${globalThis.location.origin}/story-evidence?${query}`;
    },
    [projectPath],
  );

  return { reports, running, run, evidenceUrl };
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
