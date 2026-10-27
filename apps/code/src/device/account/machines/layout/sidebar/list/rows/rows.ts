import type {
  Project as ProjectRecord,
  Session as SessionRecord,
} from '@kestack/connect/code';
import type { OnMachine } from '../../../../machine/records/index.ts';

type Project = OnMachine<ProjectRecord>;
type Session = OnMachine<SessionRecord>;

/*
 * The sidebar as a timeline: every unsettled Session of every Machine, the
 * most recently active first, whatever its Project, in one list. Activity is
 * a Turn starting or a Session being made, never viewing, so the order
 * holds while you browse. The next and previous session follow it. A
 * Project or Session is named by its Machine and its id together.
 */

/** What names a Project or Session across Machines. */
export interface Of {
  readonly machineId: string;
  readonly id: string;
}

/** A Project's or Session's name across Machines, as one key. */
export const keyOf = ({ machineId, id }: Of) => `${machineId}/${id}`;

/** A Session's place in the sidebar: `s:<machine id>/<id>`. */
export const sessionPlace = (of: Of) => `s:${keyOf(of)}`;

export interface Entry {
  readonly place: string;
  readonly session: Session;
  /** Its Project's name, or null while its Project is not listed. */
  readonly project: string | null;
}

/** The unsettled Sessions, the most recently active first, each with its Project's name. */
export function recentOf(
  projects: ReadonlyArray<Project>,
  sessions: ReadonlyArray<Session>,
): ReadonlyArray<Entry> {
  const names = new Map(projects.map((each) => [keyOf(each), each.name]));
  return sessions
    .filter(({ settledAt }) => settledAt === null)
    .toSorted((a, b) => b.activeAt - a.activeAt)
    .map((session) => ({
      place: sessionPlace(session),
      session,
      project:
        names.get(
          keyOf({ machineId: session.machineId, id: session.projectId }),
        ) ?? null,
    }));
}

/**
 * The Session `by` places from the one open in the timeline; from none,
 * the first or the last. Past either end it goes round to the other;
 * undefined only when there is no other Session.
 */
export function sessionBeside(
  recent: ReadonlyArray<Entry>,
  from: { readonly machineId: string; readonly sessionId: string } | null,
  by: 1 | -1,
): Session | undefined {
  const at =
    from === null
      ? -1
      : recent.findIndex(
          ({ session }) =>
            session.machineId === from.machineId &&
            session.id === from.sessionId,
        );
  if (at === -1) return (by === 1 ? recent[0] : recent.at(-1))?.session;
  if (recent.length < 2) return undefined;
  return recent[(at + by + recent.length) % recent.length]!.session;
}
