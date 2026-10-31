import type { Project, Session } from '@kestack/connect/code';
import { View, useChild } from '@kestack/kabuki/react';
import { Router } from '@kestack/kabuki/routing';
import { ChevronRightIcon, GitForkIcon } from 'lucide-react';
import { Skeleton } from '@kestack/web-platform/ui/components/skeleton';
import { useDevice } from '@kestack/web-platform/ui/input';
import { type ReactNode, useEffect, useRef, useState } from 'react';
import * as routes from '../../../routes/index.ts';
import type { Route } from '../../../routes/index.ts';
import { SessionStatus } from '../../../../ui/labels/status/index.ts';
import {
  pillOf,
  StandingDot,
  standingOf,
  shortOf,
  useHealth,
  useConnectionName,
  useNoticePill,
} from '../connection/link/index.ts';
import { keys } from './commands.ts';
import type { LayoutLive } from './actor.ts';

/*
 * What Layout's View draws around the page besides its children.
 *
 * 1. Keyboard  the app's keyboard, from `commands.ts`, with Vim Mode and
 *              the user's own Bindings from Preferences, which Layout read
 *              before drawing this. Vim Mode is off until turned on, by
 *              Mod+Alt+V from anywhere or in Settings, which asks Layout
 *              to keep it. On a device with no keyboard, however wide, it
 *              is off whatever is kept, and cannot be turned on; the kept
 *              choice holds again once a key is pressed. Nor does focus
 *              move there on its own, so no field raises the on-screen
 *              keyboard unasked: it goes only where the user taps, or
 *              where a Picker opts in. Voice's keys are bound here too:
 *              Space from the page's or the sidebar's Normal Mode, never
 *              where Space types, Ctrl+Space anywhere, a Picker and the
 *              Composer included, start and stop a Dictation; `d` opens
 *              the Microphone Picker; Escape never touches a Dictation.
 * 2. Header    what the App Shell's header says: where you are, as a trail
 *              from the project to the session, drawn again only as the
 *              rows of the project and session open change, and never a
 *              row "not found" that the Store or the server has yet to
 *              give; and, while the Connection is out of reach, a quiet pill
 *              that says why: on its way, its tunnel broken, or the
 *              Connection down, with when it was last seen; and, linked
 *              or not, a pill while its code Plugin is Updating or
 *              stopped, or its `ke-connect` is out of date, which opens
 *              Settings, where the rest is. Actions sit beside them (`pickers/actions/`). The header itself is
 *              the Web Platform's.
 */

// 1. Keyboard

export function Keyboard({
  vim,
  bindings,
  onVimChange,
  children,
}: {
  readonly vim: boolean;
  readonly bindings: Readonly<Record<string, ReadonlyArray<string>>>;
  readonly onVimChange: (on: boolean) => void;
  readonly children: ReactNode;
}) {
  const { keyboard } = useDevice();
  return (
    <keys.Provider
      vim={vim && keyboard}
      onVimChange={(on) => {
        if (keyboard) onVimChange(on);
      }}
      autoFocus={keyboard}
      bindings={bindings}
    >
      <VimSwitch />
      {children}
    </keys.Provider>
  );
}

/** Voice's keys: start or stop a Dictation, and choose the microphone. */
export function useVoiceKeys(voice: {
  readonly toggle: () => void;
  readonly chooseMicrophone: (how: 'keys') => void;
}) {
  keys.useAction('app.dictate', voice.toggle);
  keys.useAction('app.dictateAnywhere', voice.toggle);
  keys.useAction('picker.dictate', voice.toggle);
  keys.useAction('app.microphone', () => voice.chooseMicrophone('keys'));
}

function VimSwitch() {
  const { vim } = keys.useKeyboard();
  keys.useAction('app.vim', vim.toggle);
  return null;
}

// 2. Header

type Children = View.Props<typeof LayoutLive>['children'];
type ProjectHandle = NonNullable<Children['project']>;
type SessionHandle = NonNullable<Children['session']>;

/** The header's title, from the rows of the project and session the URL names. */
export function HeaderTitle({
  route,
  project,
  session,
}: {
  readonly route: Route;
  readonly project: ProjectHandle | undefined;
  readonly session: SessionHandle | undefined;
}) {
  if (project === undefined)
    return (
      <Title
        route={route}
        project={undefined}
        session={undefined}
        pending={false}
        unknown={false}
      />
    );
  return <ProjectTitle route={route} project={project} session={session} />;
}

function ProjectTitle({
  route,
  project,
  session,
}: {
  readonly route: Route;
  readonly project: ProjectHandle;
  readonly session: SessionHandle | undefined;
}) {
  const found = useChild(project, ({ model }) => model);
  const row = found?.rows[0]?.row;
  const unknown = (found?.neverSynced.length ?? 0) > 0;
  const pending = pendingOf(found);
  if (session === undefined)
    return (
      <Title
        route={route}
        project={row}
        session={undefined}
        pending={pending}
        unknown={unknown}
      />
    );
  return (
    <SessionTitle
      route={route}
      project={row}
      pending={pending}
      unknown={unknown}
      session={session}
    />
  );
}

function SessionTitle({
  route,
  project,
  pending,
  unknown,
  session,
}: {
  readonly route: Route;
  readonly project: Parameters<typeof Title>[0]['project'];
  readonly pending: boolean;
  readonly unknown: boolean;
  readonly session: SessionHandle;
}) {
  const found = useChild(session, ({ model }) => model);
  return (
    <Title
      route={route}
      project={project}
      session={found?.rows[0]?.row}
      pending={pending || pendingOf(found)}
      unknown={unknown || (found?.neverSynced.length ?? 0) > 0}
    />
  );
}

/**
 * Whether a row's Query cannot yet say it is missing: its Store not read,
 * or the server not answered since. Nothing is drawn for it meanwhile.
 */
const pendingOf = (
  found: { readonly status: string; readonly caughtUp: boolean } | undefined,
) => found === undefined || found.status === 'loading' || !found.caughtUp;

/** The place the route names, from the rows the header reads of it. */
export function Title({
  route,
  project,
  session,
  pending,
  unknown,
}: {
  readonly route: Route;
  readonly project: Project | undefined;
  readonly session: Session | undefined;
  /** Whether a row missing may still come: the Store not read, or the server not answered since. */
  readonly pending: boolean;
  /** Whether this device has never synced the Connection's lists: a row missing may only be not read yet. */
  readonly unknown: boolean;
}) {
  const connectionId = route._tag === 'Project' ? route.connectionId : '';
  const connection = useConnectionName(connectionId);
  if (route._tag !== 'Project')
    return route._tag === 'Home'
      ? 'Projects'
      : route._tag === 'Settings'
        ? 'Settings'
        : 'Page not found';
  if (project === undefined)
    return unknown ? (
      <Skeleton className="h-4 w-32" />
    ) : pending ? null : (
      'Project not found'
    );
  const sessionId = route.page?.sessionId;
  if (sessionId === undefined)
    return (
      <span className="flex min-w-0 items-baseline gap-2.5">
        <span className="shrink-0">{project.name}</span>
        {connection !== null && (
          <span className="shrink-0 text-xs font-normal text-muted-foreground">
            {connection}
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
        to={routes.project(connectionId, project.id)}
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
        ) : pending ? null : (
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

/** How long "Connected" shows once the Connection is back, in ms. */
export const CONNECTED_FOR = 2_000;

/**
 * While the Connection is out of reach, a pill that says why, in a word on a
 * phone, amber while it connects; once it is back, a green "Connected" for
 * a moment, then nothing; nor while its code Plugin Updating or stopped is
 * why it is linking, which `Notice` says.
 */
export function Offline({ connectionId }: { readonly connectionId: string }) {
  const health = useHealth(connectionId);
  const notice = useNoticePill(connectionId);
  const pill = pillOf(health);
  const linked = health._tag === 'Linked';
  // Back once this page saw it away: Connected, for a moment. Another
  // Connection shown starts afresh, never Connected for one never away.
  const away = useRef(!linked);
  const [back, setBack] = useState(false);
  const shownFor = useRef(connectionId);
  useEffect(() => {
    if (shownFor.current !== connectionId) {
      shownFor.current = connectionId;
      away.current = !linked;
      setBack(false);
      return;
    }
    if (!linked) {
      away.current = true;
      setBack(false);
      return;
    }
    if (!away.current) return;
    away.current = false;
    setBack(true);
    const timer = setTimeout(() => setBack(false), CONNECTED_FOR);
    return () => clearTimeout(timer);
  }, [linked, connectionId]);
  if (pill === null)
    return back ? (
      <span
        role="status"
        className="inline-flex h-7 shrink-0 animate-in items-center gap-2 rounded-full border border-border bg-muted/50 px-3 text-xs font-medium duration-200 ease-out fade-in-0 motion-reduce:animate-none"
      >
        <StandingDot kind="Linked" />
        Connected
      </span>
    ) : null;
  // A Plugin Updating or stopped is why it is linking: the Notice says so.
  if (
    notice !== null &&
    health._tag === 'Seen' &&
    (health.status._tag === 'Reachable' || health.status._tag === 'Unchecked')
  )
    return null;
  const [label, title] = pill;
  return (
    <span
      role="status"
      title={title}
      className="inline-flex h-7 shrink-0 items-center gap-2 rounded-full border border-border bg-muted/50 px-3 text-xs font-medium"
    >
      <StandingDot kind={standingOf(health, null).kind} />
      <span className="md:hidden">{shortOf(health)}</span>
      <span className="max-md:hidden">{label}</span>
    </span>
  );
}

/**
 * While the Connection's code Plugin is Updating or stopped, or its
 * `ke-connect` is out of date, a pill that says so and opens Settings on its
 * Connections; nothing otherwise.
 */
export function Notice({ connectionId }: { readonly connectionId: string }) {
  const notice = useNoticePill(connectionId);
  if (notice === null) return null;
  const [label, title, tone] = notice;
  return (
    <Router.Link
      to={routes.settings()}
      onClick={() => routes.openSettingsOn('Connections')}
      role="status"
      title={title}
      className="focus-ring inline-flex h-7 max-w-56 shrink-0 items-center gap-2 rounded-full border border-border bg-muted/50 px-3 text-xs font-medium transition-colors hover:bg-muted"
    >
      <span aria-hidden className={`size-2 shrink-0 rounded-full ${tone}`} />
      <span className="truncate">{label}</span>
    </Router.Link>
  );
}
