import type { Project, Session } from '@kestack/ai-toolkit/api';
import { Router } from '@kestack/kabuki/routing';
import {
  ChevronRightIcon,
  GitForkIcon,
} from '@kestack/web-platform/components/lucide';
import { Skeleton } from '@kestack/web-platform/components/skeleton';
import * as places from '../../places/index.ts';
import type { Place } from '../../places/index.ts';
import { Mark } from '../../ui/mark/index.ts';
import { SessionStatus } from '../../ui/session-status/index.ts';
import { useOffline } from '../connection/index.ts';

/*
 * What the App Shell's header says: where you are, as a trail from the
 * project to the session; the open session's agent and model; and, while
 * the server is out of reach, a pill that says so. Session Actions sit
 * beside them (`session-actions/`). The header itself is the Web
 * Platform's.
 */

const AGENT = { claude: 'Claude', codex: 'Codex' } as const;

/** The app's mark and name, leading home. */
export function Brand() {
  return (
    <Router.Link
      to={places.home()}
      className="focus-ring flex h-8 w-fit items-center gap-2 rounded-md px-2 text-[15px] font-semibold tracking-tight"
    >
      <Mark className="size-5" />
      code
    </Router.Link>
  );
}

/** The place the route names, found in what the sidebar already reads. */
export function Title({
  route,
  projects,
  sessions,
  caughtUp,
}: {
  readonly route: Place;
  readonly projects: ReadonlyArray<Project>;
  readonly sessions: ReadonlyArray<Session>;
  /** Whether each list has had the server's answer, so a row missing from it is gone. */
  readonly caughtUp: { readonly projects: boolean; readonly sessions: boolean };
}) {
  if (route._tag !== 'Project')
    return route._tag === 'Home'
      ? 'Projects'
      : route._tag === 'Settings'
        ? 'Settings'
        : 'Page not found';
  const project = projects.find(({ id }) => id === route.projectId);
  if (project === undefined)
    return caughtUp.projects ? (
      'Project not found'
    ) : (
      <Skeleton className="h-4 w-32" />
    );
  const sessionId = route.page?.sessionId;
  if (sessionId === undefined)
    return (
      <span className="flex min-w-0 items-baseline gap-2.5">
        <span className="shrink-0">{project.name}</span>
        <span
          title={project.path}
          className="hidden min-w-0 truncate font-mono text-xs font-normal text-muted-foreground sm:block"
        >
          {project.path}
        </span>
      </span>
    );
  const session = sessions.find(({ id }) => id === sessionId);
  return (
    <span className="flex min-w-0 items-center gap-1.5">
      <Router.Link
        to={places.project(project.id)}
        className="focus-ring hidden shrink-0 rounded-sm font-normal text-muted-foreground transition-colors duration-150 hover:text-foreground sm:block"
      >
        {project.name}
      </Router.Link>
      <ChevronRightIcon
        aria-hidden
        className="hidden size-3.5 shrink-0 text-muted-foreground/60 sm:block"
      />
      {session === undefined ? (
        caughtUp.sessions ? (
          'Session not found'
        ) : (
          <Skeleton className="h-4 w-40" />
        )
      ) : (
        <>
          {session.forkedFrom !== null && (
            <GitForkIcon
              role="img"
              aria-label="Forked"
              className="size-3.5 shrink-0 text-muted-foreground"
            />
          )}
          <span className="min-w-0 truncate" title={session.title || undefined}>
            {session.title || 'Untitled session'}
          </span>
          <SessionStatus status={session.status} />
        </>
      )}
    </span>
  );
}

/** The open session's agent and model, quiet, from the `md` width. */
export function Model({ session }: { readonly session: Session | undefined }) {
  if (session === undefined) return null;
  return (
    <span className="hidden truncate pr-1 text-xs text-muted-foreground md:block">
      {AGENT[session.harness]} · {session.model}
    </span>
  );
}

/** While the server is out of reach, a pill that says so; nothing otherwise. */
export function Offline() {
  const offline = useOffline();
  if (offline === null) return null;
  return (
    <span
      role="status"
      title={`${offline} to the server…`}
      className="inline-flex h-7 shrink-0 items-center gap-2 rounded-full border border-border bg-muted/50 px-3 text-xs font-medium"
    >
      <span className="relative inline-flex size-2 shrink-0">
        <span className="absolute inset-0 animate-ping rounded-full bg-warning opacity-50 motion-reduce:hidden" />
        <span className="relative size-2 rounded-full bg-warning" />
      </span>
      {offline}…
    </span>
  );
}
