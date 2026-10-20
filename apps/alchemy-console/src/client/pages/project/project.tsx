import { Effect, Schedule, Stream } from 'effect';
import { View } from '@kestack/kabuki/react';
import { Page, Router } from '@kestack/kabuki/routing';
import { ArrowLeftIcon } from '@kestack/web-platform/components/lucide';
import { Skeleton } from '@kestack/web-platform/components/skeleton';
import {
  nameOf,
  PRODUCTION_STAGE,
  type ProjectDetail,
} from '../../../shared/contracts/project/index.ts';
import { Api, Project, router } from '../../../shared/pages/index.ts';
import { RunViewLive, RunViewView } from '../../run-view/index.ts';
import { RunLive, RunPageView } from './run/index.ts';
import { StageCard } from '../../stage/index.ts';

/*
 * A project, as it behaves.
 *
 * 1. Follow  a Worker follows `Projects.get`, so the stage's status and
 *            outputs move on in every tab as a deploy goes; until it speaks,
 *            the project the page was drawn with stands in.
 * 2. Watch   at the project itself, Production's latest run is a RunView
 *            Child, one per run, so a new deploy is drawn afresh.
 * 3. Run     a run's own page sits under it, with a way back.
 */

const detailOf = (
  model: { readonly live: ProjectDetail | null },
  status: { readonly _tag: string; readonly data?: ProjectDetail | null },
) => model.live ?? (status._tag === 'Ready' ? (status.data ?? null) : null);

const productionOf = (detail: ProjectDetail | null) =>
  detail?.stages.find((stage) => stage.name === PRODUCTION_STAGE) ?? null;

export const ProjectLive = Page.build(Project, {
  pages: { Run: RunLive },
  init: () => ({ model: { live: null } }),
  // 1. Follow
  workers: {
    detail: {
      run: (self) =>
        Effect.gen(function* () {
          const api = yield* Api;
          const { props } = yield* self.get;
          yield* api
            .follow((client) =>
              client['Projects.get']({ projectId: props.params.projectId }),
            )
            .pipe(
              Stream.runForEach((detail) =>
                self.send({ _tag: 'DetailSeen', detail }),
              ),
            );
        }).pipe(Effect.retry(Schedule.spaced('2 seconds')), Effect.orDie),
    },
  },
  // 2. Watch
  children: {
    latest: {
      actor: RunViewLive,
      each: ({ model, props }) => {
        if (props.route.page) return [];
        const runId = productionOf(detailOf(model, props.status))?.lastRunId;
        return runId ? [runId] : [];
      },
      props: (_, runId) => ({ runId }),
    },
  },
  on: {
    DetailSeen: ({ detail }, { model }) => ({
      model: { ...model, live: detail },
    }),
  },
});

function ProjectSkeleton() {
  return (
    <div aria-busy className="flex flex-col gap-8">
      <div className="flex flex-col gap-2">
        <Skeleton className="h-9 w-56" />
        <Skeleton className="h-5 w-72 max-w-full" />
      </div>
      <Skeleton className="h-32 w-full rounded-lg" />
    </div>
  );
}

function NotFound() {
  return (
    <div className="flex flex-col items-start gap-2">
      <h1 className="text-2xl font-semibold tracking-tight">
        This project doesn't exist.
      </h1>
      <Router.Link
        to={router.Console.Welcome()}
        className="text-sm underline underline-offset-4"
      >
        Go to your projects
      </Router.Link>
    </div>
  );
}

export const ProjectView = View.make(
  ProjectLive,
  ({ model, props, children, root }) => {
    const detail = detailOf(model, props.status);
    const notFound =
      props.status._tag === 'Failed' && props.status.notFound === true;
    const projectId = props.params.projectId;
    return (
      <div {...root} className="flex max-w-3xl flex-col gap-8 py-10 sm:py-16">
        {notFound ? (
          <NotFound />
        ) : detail === null ? (
          <ProjectSkeleton />
        ) : (
          <>
            <header className="flex flex-col gap-2">
              {props.route.page ? (
                <Router.Link
                  to={router.Console.Project({ projectId })}
                  className="inline-flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
                >
                  <ArrowLeftIcon aria-hidden className="size-4" />
                  {nameOf(detail.project)}
                </Router.Link>
              ) : (
                <>
                  <h1 className="text-2xl font-semibold tracking-tight break-words sm:text-3xl">
                    {nameOf(detail.project)}
                  </h1>
                  <p className="text-sm text-muted-foreground break-all">
                    <a
                      href={`https://github.com/${detail.project.repo.fullName}`}
                      target="_blank"
                      rel="noreferrer"
                      className="underline-offset-4 hover:underline"
                    >
                      {detail.project.repo.fullName}
                    </a>
                    {detail.project.folder === '.'
                      ? ''
                      : `/${detail.project.folder}`}{' '}
                    · deploys {detail.project.productionBranch}
                  </p>
                </>
              )}
            </header>
            {children.Run ? (
              <RunPageView instance={children.Run} />
            ) : (
              <>
                <StageCard projectId={projectId} stage={productionOf(detail)} />
                {children.latest.map((handle) => (
                  <RunViewView key={handle.key} instance={handle} />
                ))}
              </>
            )}
          </>
        )}
      </div>
    );
  },
);
