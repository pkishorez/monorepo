import { Router } from '@kestack/kabuki/routing';
import { buttonVariants } from '@kestack/web-platform/components/button';
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from '@kestack/web-platform/components/empty';
import { PlusIcon } from '@kestack/web-platform/components/lucide';
import { Skeleton } from '@kestack/web-platform/components/skeleton';
import {
  nameOf,
  type ProjectSummary,
} from '../../../shared/contracts/project/index.ts';
import { router } from '../../../shared/pages/index.ts';
import { StageBadge, StageUrl } from '../../stage/index.ts';

/*
 * The member's projects: one card each, its name, repository, Production's
 * status and URL, the whole card a link to the project. With none, the one
 * next step is creating the first.
 */

function NewProjectLink({ outline }: { readonly outline?: boolean }) {
  return (
    <Router.Link
      to={router.Console.NewProject()}
      className={buttonVariants({
        variant: outline ? 'outline' : 'default',
        className: 'shrink-0',
      })}
    >
      <PlusIcon aria-hidden />
      New project
    </Router.Link>
  );
}

function ProjectCard({ summary }: { readonly summary: ProjectSummary }) {
  const { project, production } = summary;
  return (
    <li className="relative flex flex-col gap-2 rounded-lg border border-border px-4 py-4 transition-colors duration-150 focus-within:ring-3 focus-within:ring-ring/50 hover:bg-muted/40">
      <div className="flex items-start justify-between gap-3">
        <h2 className="min-w-0 font-medium break-words">
          <Router.Link
            to={router.Console.Project({ projectId: project.projectId })}
            className="outline-none after:absolute after:inset-0 after:rounded-lg"
          >
            {nameOf(project)}
          </Router.Link>
        </h2>
        {production !== null && <StageBadge status={production.status} />}
      </div>
      <p className="truncate text-sm text-muted-foreground">
        {project.repo.fullName}
        {project.folder === '.' ? '' : `/${project.folder}`}
      </p>
      {production !== null && <StageUrl stage={production} />}
    </li>
  );
}

export function Projects({
  projects,
}: {
  readonly projects: ReadonlyArray<ProjectSummary>;
}) {
  return (
    <>
      <div className="flex items-center justify-between gap-4">
        <h1
          id="welcome-title"
          className="text-2xl font-semibold tracking-tight sm:text-3xl"
        >
          Projects
        </h1>
        {projects.length > 0 && <NewProjectLink outline />}
      </div>
      {projects.length === 0 ? (
        <Empty className="rounded-lg border border-dashed border-border">
          <EmptyHeader>
            <EmptyTitle>Create your first project</EmptyTitle>
            <EmptyDescription>
              Pick a repository folder with an alchemy.run.ts, and Console
              deploys it to Production.
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <NewProjectLink />
          </EmptyContent>
        </Empty>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {projects.map((summary) => (
            <ProjectCard key={summary.project.projectId} summary={summary} />
          ))}
        </ul>
      )}
    </>
  );
}

/** The list while it is on the way: a heading and two cards. */
export function ProjectsSkeleton() {
  return (
    <div aria-busy className="flex flex-col gap-6">
      <Skeleton className="h-9 w-40" />
      <div className="grid gap-3 sm:grid-cols-2">
        {[0, 1].map((key) => (
          <Skeleton key={key} className="h-28 rounded-lg" />
        ))}
      </div>
    </div>
  );
}
