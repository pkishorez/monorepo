import type { Project, Session } from '@kestack/ai-toolkit/api';
import { Router } from '@kestack/kabuki/routing';
import {
  ArchiveIcon,
  ArchiveRestoreIcon,
  XIcon,
} from '@kestack/web-platform/ui/components/lucide';
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@kestack/web-platform/recipes/frame';
import { useDevice } from '@kestack/web-platform/ui/input';
import { useBound } from '../../../../keys.ts';
import * as places from '../../../places/index.ts';
import type { OnMachine } from '../../../replica/index.ts';
import { SwipeToMove } from '../swipe/index.ts';

/*
 * The Settled List: every Settled Session, flat, the most recently Settled
 * first, each with its Project's name. A row opens its Session; its button
 * Un-settles it, which puts it back among its Project's Sessions. With no
 * keyboard a row swipes to un-Settle instead, and its button is only
 * heard, by a screen reader, which cannot swipe it. The one
 * line at the sidebar's foot, "Settled · N", opens and closes it in place
 * of the Projects.
 */

/** The Settled Sessions, the most recently Settled first, with their Project's name. */
export const settledOf = (
  projects: ReadonlyArray<OnMachine<Project>>,
  sessions: ReadonlyArray<OnMachine<Session>>,
) => {
  const names = new Map(
    projects.map(({ machineId, id, name }) => [`${machineId}/${id}`, name]),
  );
  return sessions
    .filter(({ settledAt }) => settledAt !== null)
    .sort((a, b) => (b.settledAt ?? 0) - (a.settledAt ?? 0))
    .map((session) => ({
      place: `t:${session.machineId}/${session.id}`,
      session,
      project: names.get(`${session.machineId}/${session.projectId}`) ?? null,
    }));
};

type Listed = ReturnType<typeof settledOf>[number];

/** A row: a finger's height, but 28px with a keyboard on a wide screen. */
const row = 'h-11 gap-2 px-2 py-0 keyboard:md:h-7 data-active:font-normal';
/** A Session's row: a little taller than a finger, to swipe, alike. */
const sessionRow =
  'h-12 gap-2 px-2 py-0 keyboard:md:h-7 data-active:font-normal';
const cursorRing = 'data-cursor:ring-2 data-cursor:ring-inset';

export function SettledList({
  listed,
  open,
  at,
  onUnsettle,
  onMove,
  onClose,
}: {
  readonly listed: ReadonlyArray<Listed>;
  /** The Session open, if one is, by its Machine and id. */
  readonly open: { readonly machineId: string; readonly id: string } | null;
  /** Whether the keyboard's cursor is on a place. */
  readonly at: (place: string) => true | undefined;
  readonly onUnsettle: (machineId: string, sessionId: string) => void;
  /** A Session swiped to un-Settle it. */
  readonly onMove: (session: OnMachine<Session>, settled: boolean) => void;
  readonly onClose: () => void;
}) {
  const settle = useBound('app.actions');
  // With no keyboard a row swipes to un-Settle; its button is only heard.
  const { keyboard } = useDevice();
  return (
    <SidebarGroup className="px-2 py-1">
      <SidebarGroupLabel className="h-11 justify-between pr-0 keyboard:h-7">
        Settled
        <button
          type="button"
          aria-label="Close the Settled list"
          title="Close"
          onClick={onClose}
          className="focus-ring grid size-11 place-items-center rounded-md text-muted-foreground/70 keyboard:size-6 transition-colors duration-150 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground motion-reduce:transition-none"
        >
          <XIcon aria-hidden className="size-3.5" />
        </button>
      </SidebarGroupLabel>
      <SidebarGroupContent>
        {listed.length === 0 ? (
          <p className="px-2 py-1.5 text-xs text-muted-foreground">
            {!keyboard
              ? 'Nothing is Settled. Swipe a session you are done with to the right to Settle it.'
              : `Nothing is Settled. Settle a session you are done with from Session Actions${settle === null ? '' : ` (${settle})`}.`}
          </p>
        ) : (
          <SidebarMenu className="gap-0">
            {listed.map(({ place, session, project }) => {
              return (
                <SidebarMenuItem key={place} className="group/settled">
                  <SwipeToMove
                    settled
                    onMove={(settled) => onMove(session, settled)}
                  >
                    <SidebarMenuButton
                      data-place={place}
                      data-cursor={at(place)}
                      isActive={
                        open?.machineId === session.machineId &&
                        open.id === session.id
                      }
                      className={`${sessionRow} ${cursorRing} ${keyboard ? 'pr-9' : ''}`}
                      render={
                        <Router.Link
                          to={places.session(
                            session.machineId,
                            session.projectId,
                            session.id,
                          )}
                          title={session.title || undefined}
                        />
                      }
                    >
                      <span className="min-w-0 flex-1 truncate">
                        {session.title || 'Untitled session'}
                      </span>
                      {project !== null && (
                        <span className="max-w-[40%] shrink-0 truncate text-xs text-muted-foreground">
                          {project}
                        </span>
                      )}
                    </SidebarMenuButton>
                  </SwipeToMove>
                  <button
                    type="button"
                    aria-label={`Un-settle ${session.title || 'Untitled session'}`}
                    title="Un-settle"
                    onClick={() => onUnsettle(session.machineId, session.id)}
                    className={
                      keyboard
                        ? 'focus-ring absolute top-3 right-1 grid size-6 place-items-center rounded-md text-muted-foreground/70 opacity-0 transition-[opacity,color,background-color] duration-150 group-hover/settled:opacity-100 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:opacity-100 disabled:opacity-100 motion-reduce:transition-none md:top-0.5 [@media(hover:none)]:opacity-100'
                        : 'sr-only'
                    }
                  >
                    <ArchiveRestoreIcon aria-hidden className="size-3.5" />
                  </button>
                </SidebarMenuItem>
              );
            })}
          </SidebarMenu>
        )}
      </SidebarGroupContent>
    </SidebarGroup>
  );
}

/** The one line at the sidebar's foot that opens and closes the Settled List. */
export function SettledLine({
  count,
  open,
  cursor,
  onToggle,
}: {
  readonly count: number;
  readonly open: boolean;
  readonly cursor: true | undefined;
  readonly onToggle: () => void;
}) {
  return (
    <SidebarMenu className="px-2">
      <SidebarMenuItem>
        <SidebarMenuButton
          data-place="settled"
          data-cursor={cursor}
          aria-expanded={open}
          isActive={open}
          onClick={onToggle}
          className={`${row} ${cursorRing} text-xs text-muted-foreground`}
        >
          <ArchiveIcon aria-hidden className="size-3.5!" />
          <span className="tabular-nums">Settled · {count}</span>
        </SidebarMenuButton>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
