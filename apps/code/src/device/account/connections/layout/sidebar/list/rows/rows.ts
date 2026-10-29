import type {
  Project as ProjectRecord,
  Session as SessionRecord,
} from '@kestack/connect/code';
import type { OnConnection } from '../../../../connection/records/index.ts';

type Project = OnConnection<ProjectRecord>;
type Session = OnConnection<SessionRecord>;

/*
 * The sidebar by Project: every unsettled Session of every Connection under
 * its Project, the most recently active first, and the Projects in the
 * order of their most recently active Session, so a Project with no
 * unsettled Session is not listed. Activity is a Turn starting or a Session
 * being made, never viewing, so the order holds while you browse. While
 * the Connection Filter shows every Connection and more than one is listed
 * (`namesOf`), the Projects are by Connection first, the Connections in the
 * order of their most recently active Session, each named once, over its
 * first Project. The next and previous session follow the order drawn. A
 * Project or Session is named by its Connection and its id together.
 */

/** What names a Project or Session across Connections. */
export interface Of {
  readonly connectionId: string;
  readonly id: string;
}

/** A Project's or Session's name across Connections, as one key. */
export const keyOf = ({ connectionId, id }: Of) => `${connectionId}/${id}`;

/** A Session's place in the sidebar: `s:<connection id>/<id>`. */
export const sessionPlace = (of: Of) => `s:${keyOf(of)}`;

/** A Project's heading's place in the sidebar: `p:<connection id>/<id>`. */
export const projectPlace = (of: Of) => `p:${keyOf(of)}`;

export interface Entry {
  readonly place: string;
  readonly session: Session;
}

/** A Project listed, with its unsettled Sessions. */
export interface Group {
  readonly place: string;
  readonly connectionId: string;
  readonly projectId: string;
  /** Its name, or null while the Project is not held. */
  readonly name: string | null;
  /** Its Connection's name, to draw over it as the first of its Connection's Projects; else null. */
  readonly connection: string | null;
  readonly sessions: ReadonlyArray<Entry>;
}

/**
 * A Connection's name as short as it is still its own: the name it was
 * served as, for one named `<host> (<name>)`; else the name in full.
 */
export const shortNameOf = (name: string) =>
  /\(([^()]+)\)$/.exec(name)?.[1] ?? name;

/**
 * The Connections' short names, by id, to draw the Projects under: null
 * while the Connection Filter shows one Connection, or only one is listed.
 */
export const namesOf = (
  connections: ReadonlyArray<{ readonly id: string; readonly name: string }>,
  shown: string | null,
): ReadonlyMap<string, string> | null =>
  shown === null && connections.length > 1
    ? new Map(connections.map(({ id, name }) => [id, shortNameOf(name)]))
    : null;

/** The prefix of the branches Code makes for a new Worktree. */
const OURS = 'ke-code/';

/**
 * A Session's branch as its row says it: one Code made for a new Worktree
 * by the rest of its name, marked a Worktree, the prefix being Code's own;
 * any other in full.
 */
export const branchShown = (branch: string) =>
  branch.startsWith(OURS) && branch.length > OURS.length
    ? { text: branch.slice(OURS.length), worktree: true }
    : { text: branch, worktree: false };

/** The Projects with an unsettled Session, each with them, the most recently active first. */
export function groupedOf(
  projects: ReadonlyArray<Project>,
  sessions: ReadonlyArray<Session>,
  connections: ReadonlyMap<string, string> | null = null,
): ReadonlyArray<Group> {
  const names = new Map(projects.map((each) => [keyOf(each), each.name]));
  const groups = new Map<string, Group & { sessions: Array<Entry> }>();
  for (const session of sessions
    .filter(({ settledAt }) => settledAt === null)
    .toSorted((a, b) => b.activeAt - a.activeAt)) {
    const of = { connectionId: session.connectionId, id: session.projectId };
    const key = keyOf(of);
    const group = groups.get(key) ?? {
      place: projectPlace(of),
      connectionId: session.connectionId,
      projectId: session.projectId,
      name: names.get(key) ?? null,
      connection: null,
      sessions: [],
    };
    group.sessions.push({ place: sessionPlace(session), session });
    groups.set(key, group);
  }
  const ordered = [...groups.values()];
  if (connections === null) return ordered;
  // By Connection, in the order of its first Project, so of its most recent Session.
  const order = [...new Set(ordered.map(({ connectionId }) => connectionId))];
  return order.flatMap((connectionId) =>
    ordered
      .filter((group) => group.connectionId === connectionId)
      .map((group, index) =>
        index === 0
          ? { ...group, connection: connections.get(connectionId) ?? null }
          : group,
      ),
  );
}

/**
 * The Session `by` places from the one open, in the order drawn; from
 * none, the first or the last. Past either end it goes round to the other;
 * undefined only when there is no other Session.
 */
export function sessionBeside(
  groups: ReadonlyArray<Group>,
  from: { readonly connectionId: string; readonly sessionId: string } | null,
  by: 1 | -1,
): Session | undefined {
  const drawn = groups.flatMap(({ sessions }) => sessions);
  const at =
    from === null
      ? -1
      : drawn.findIndex(
          ({ session }) =>
            session.connectionId === from.connectionId &&
            session.id === from.sessionId,
        );
  if (at === -1) return (by === 1 ? drawn[0] : drawn.at(-1))?.session;
  if (drawn.length < 2) return undefined;
  return drawn[(at + by + drawn.length) % drawn.length]!.session;
}
