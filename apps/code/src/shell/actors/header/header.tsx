import type { Project, Session } from '@kestack/connect/code';
import { Router } from '@kestack/kabuki/routing';
import {
  ChevronRightIcon,
  GitForkIcon,
} from '@kestack/web-platform/ui/components/lucide';
import { Skeleton } from '@kestack/web-platform/ui/components/skeleton';
import * as routes from '../../routes/index.ts';
import type { Route } from '../../routes/index.ts';
import { ago } from '../../../ui/time/index.ts';
import { SessionStatus } from '../../../ui/session-status/index.ts';
import { useHealth, useMachineName } from '../../machines/index.ts';

/*
 * What the App Shell's header says: where you are, as a trail from the
 * project to the session; the open session's agent and model; and, while
 * the Machine is out of reach, a quiet pill that says why: on its way,
 * its tunnel broken, or the Machine down, with when it was last seen.
 * Session Actions sit beside them (`actors/pickers/session-actions/`). The header
 * itself is the Web Platform's.
 */

const AGENT = { claude: 'Claude', codex: 'Codex' } as const;

/** The place the route names, from the rows the header reads of it. */
export function Title({
  route,
  project,
  session,
  unknown,
}: {
  readonly route: Route;
  readonly project: Project | undefined;
  readonly session: Session | undefined;
  /** Whether this device has never synced the Machine's lists: a row missing may only be not read yet. */
  readonly unknown: boolean;
}) {
  const machineId = route._tag === 'Project' ? route.machineId : '';
  const machine = useMachineName(machineId);
  if (route._tag !== 'Project')
    return route._tag === 'Home'
      ? 'Projects'
      : route._tag === 'Settings'
        ? 'Settings'
        : 'Page not found';
  if (project === undefined)
    return unknown ? <Skeleton className="h-4 w-32" /> : 'Project not found';
  const sessionId = route.page?.sessionId;
  if (sessionId === undefined)
    return (
      <span className="flex min-w-0 items-baseline gap-2.5">
        <span className="shrink-0">{project.name}</span>
        {machine !== null && (
          <span className="shrink-0 text-xs font-normal text-muted-foreground">
            {machine}
          </span>
        )}
        <span
          title={project.path}
          className="hidden min-w-0 truncate font-mono text-xs font-normal text-muted-foreground sm:block"
        >
          {project.path}
        </span>
      </span>
    );
  return (
    <span className="flex min-w-0 items-center gap-1.5">
      <Router.Link
        to={routes.project(machineId, project.id)}
        className="focus-ring hidden shrink-0 items-center rounded-sm font-normal text-muted-foreground transition-colors duration-150 hover:text-foreground sm:flex sm:min-h-11 sm:min-w-11 keyboard:sm:min-h-0 keyboard:sm:min-w-0"
      >
        {project.name}
      </Router.Link>
      <ChevronRightIcon
        aria-hidden
        className="hidden size-3.5 shrink-0 text-muted-foreground/60 sm:block"
      />
      {session === undefined ? (
        unknown ? (
          <Skeleton className="h-4 w-40" />
        ) : (
          'Session not found'
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

/**
 * The open session's agent and model, quiet, from the `md` width with a
 * keyboard. With none, the Draft's model chip says it, and the title keeps
 * the room.
 */
export function Model({ session }: { readonly session: Session | undefined }) {
  if (session === undefined) return null;
  return (
    <span className="hidden truncate pr-1 text-xs text-muted-foreground keyboard:md:block">
      {AGENT[session.harness]} · {session.model}
    </span>
  );
}

type Pill = readonly [label: string, title: string, tone: string];

/** What the pill says, more of it on hover, and its colour, while the Machine is out of reach. */
const pillOf = (health: ReturnType<typeof useHealth>): Pill | null => {
  switch (health._tag) {
    case 'Connected':
      return null;
    case 'Unknown':
      return ['Connecting…', 'Connecting to the Machine…', 'bg-warning'];
    case 'Down':
      return [
        `Machine down · last seen ${ago(health.lastSeen)}`,
        'The Machine has not reported for a while: it may be off or asleep. What it last synced stays readable.',
        'bg-destructive',
      ];
  }
  const { status, lastSeen } = health;
  switch (status._tag) {
    case 'Installing':
      return [
        'Downloading cloudflared…',
        'The Machine is downloading cloudflared, once, to open its tunnel. On a slow network this takes a few minutes.',
        'bg-warning',
      ];
    case 'Opening':
      return [
        'Opening tunnel…',
        'The Machine is opening its tunnel to Cloudflare.',
        'bg-warning',
      ];
    case 'OpenFailed':
      return [
        'Tunnel failed · retrying',
        `The Machine could not open its tunnel: ${status.problem}. It tries again shortly.`,
        'bg-warning',
      ];
    case 'Unreachable':
      return [
        `Out of reach · seen ${ago(lastSeen)}`,
        `The Machine is up, but its tunnel is broken: ${status.problem}. Reconnecting…`,
        'bg-warning',
      ];
    case 'Unchecked':
    case 'Reachable':
      return [
        'Connecting…',
        `Connecting to the Machine, last seen ${ago(lastSeen)}…`,
        'bg-warning',
      ];
  }
};

/** The pill's word on a phone, where the header has room for little else. */
const shortOf = (health: ReturnType<typeof useHealth>) =>
  health._tag === 'Down'
    ? 'Machine down'
    : health._tag === 'Seen' &&
        (health.status._tag === 'Unreachable' ||
          health.status._tag === 'OpenFailed')
      ? 'Out of reach'
      : 'Connecting…';

/**
 * While the Machine is out of reach, a pill that says why, in a word on a
 * phone; nothing otherwise.
 */
export function Offline({ machineId }: { readonly machineId: string }) {
  const health = useHealth(machineId);
  const pill = pillOf(health);
  if (pill === null) return null;
  const [label, title, tone] = pill;
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
      <span className="md:hidden">{shortOf(health)}</span>
      <span className="max-md:hidden">{label}</span>
    </span>
  );
}
