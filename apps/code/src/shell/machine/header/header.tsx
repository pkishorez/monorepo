import type { Project, Session } from '@kestack/ai-toolkit/api';
import { Router } from '@kestack/kabuki/routing';
import {
  ChevronRightIcon,
  GitForkIcon,
} from '@kestack/web-platform/components/lucide';
import { Skeleton } from '@kestack/web-platform/components/skeleton';
import * as places from '../../../places/index.ts';
import type { Place } from '../../../places/index.ts';
import { ago } from '../../../ui/time/index.ts';
import { SessionStatus } from '../../../ui/session-status/index.ts';
import { useHealth, useMachineId } from '../connection/index.ts';

/*
 * What the App Shell's header says: where you are, as a trail from the
 * project to the session; the open session's agent and model; and, while
 * the Machine is out of reach, a quiet pill that says why: on its way,
 * its tunnel broken, or the Machine down, with when it was last seen.
 * Session Actions sit beside them (`session-actions/`). The header itself
 * is the Web Platform's.
 */

const AGENT = { claude: 'Claude', codex: 'Codex' } as const;

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
  const machineId = useMachineId();
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
        to={places.project(machineId, project.id)}
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

/** While the Machine is out of reach, a pill that says why; nothing otherwise. */
export function Offline() {
  const health = useHealth();
  if (health._tag === 'Connected') return null;
  const [label, title, tone] =
    health._tag === 'Down'
      ? [
          `Machine down · last seen ${ago(health.lastSeen)}`,
          'The Machine has not reported for a while: it may be off or asleep. What it last synced stays readable.',
          'bg-destructive',
        ]
      : health._tag === 'TunnelBroken'
        ? [
            `Out of reach · seen ${ago(health.lastSeen)}`,
            `The Machine is up, but its tunnel is broken${health.problem === null ? '' : `: ${health.problem}`}. Reconnecting…`,
            'bg-warning',
          ]
        : health._tag === 'Connecting'
          ? [
              'Connecting…',
              `Connecting to the Machine, last seen ${ago(health.lastSeen)}…`,
              'bg-warning',
            ]
          : ['Connecting…', 'Connecting to the Machine…', 'bg-warning'];
  return (
    <span
      role="status"
      title={title}
      className="inline-flex h-7 shrink-0 items-center gap-2 rounded-full border border-border bg-muted/50 px-3 text-xs font-medium"
    >
      <span className="relative inline-flex size-2 shrink-0">
        {health._tag !== 'Down' && (
          <span
            className={`absolute inset-0 animate-ping rounded-full opacity-50 motion-reduce:hidden ${tone}`}
          />
        )}
        <span className={`relative size-2 rounded-full ${tone}`} />
      </span>
      {label}
    </span>
  );
}
