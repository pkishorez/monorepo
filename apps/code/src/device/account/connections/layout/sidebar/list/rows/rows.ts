import type {
  Project as ProjectRecord,
  Session as SessionRecord,
} from '@kestack/connect/code';
import type { OnConnection } from '../../../../connection/records/index.ts';
import { shortNameOf } from '../../../../connection/link/index.ts';

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
 * order of their most recently active Session, those out of reach last, each
 * named once, over its first Project; a Connection collapsed hides its
 * Projects (`shownOf`). The next and previous session follow the order
 * drawn, past what is hidden. A heading says the branch its Project's folder
 * is on, as its Sessions there last found it; a row says its own only when
 * that differs (`branchOf`). A Project or Session is named by its Connection
 * and its id together.
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

/** A Connection's name's place in the sidebar: `c:<connection id>`. */
export const connectionPlace = (connectionId: string) => `c:${connectionId}`;

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
  /** The branch its folder is on, as its Sessions there last found it; null when none says. */
  readonly branch: string | null;
  readonly sessions: ReadonlyArray<Entry>;
}

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

/**
 * The branch a row says: its Session's, as `branchShown` says it, only when
 * it is not the one its Project's heading says, so in practice its own
 * Worktree's; never for a Session with no Worktree, which is in its
 * Project's folder; else null.
 */
export const branchOf = (session: Session, heading: string | null) =>
  session.worktree === null ||
  session.branch === null ||
  session.branch === heading
    ? null
    : branchShown(session.branch).text;

/**
 * The branch each Project's folder is on, by `keyOf`: as its most recently
 * active Session in the folder itself last found it, Settled ones too. A
 * Session with no Worktree, as one made before Worktrees, is in the folder.
 */
const branchesOf = (
  projects: ReadonlyArray<Project>,
  sessions: ReadonlyArray<Session>,
) => {
  const paths = new Map(projects.map((each) => [keyOf(each), each.path]));
  const found = new Map<string, { at: number; branch: string }>();
  for (const session of sessions) {
    const key = keyOf({
      connectionId: session.connectionId,
      id: session.projectId,
    });
    const inFolder =
      session.worktree === null || session.worktree === paths.get(key);
    if (session.branch === null || !inFolder) continue;
    const was = found.get(key);
    if (was === undefined || session.activeAt > was.at)
      found.set(key, { at: session.activeAt, branch: session.branch });
  }
  return found;
};

/**
 * The Projects with an unsettled Session, each with them, the most recently
 * active first; by Connection while `connections` names them, those `away`,
 * out of reach, last.
 */
export function groupedOf(
  projects: ReadonlyArray<Project>,
  sessions: ReadonlyArray<Session>,
  connections: ReadonlyMap<string, string> | null = null,
  away: (connectionId: string) => boolean = () => false,
): ReadonlyArray<Group> {
  const names = new Map(projects.map((each) => [keyOf(each), each.name]));
  const branches = branchesOf(projects, sessions);
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
      branch: branches.get(key)?.branch ?? null,
      sessions: [],
    };
    group.sessions.push({ place: sessionPlace(session), session });
    groups.set(key, group);
  }
  const ordered = [...groups.values()];
  if (connections === null) return ordered;
  // By Connection, in the order of its first Project, so of its most recent
  // Session, those out of reach last.
  const order = [
    ...new Set(ordered.map(({ connectionId }) => connectionId)),
  ].toSorted((a, b) => Number(away(a)) - Number(away(b)));
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
 * The Projects shown: all but those of a Connection `collapsed`, which only
 * its name stands for.
 */
export const shownOf = (
  groups: ReadonlyArray<Group>,
  collapsed: ReadonlySet<string>,
) => groups.filter(({ connectionId }) => !collapsed.has(connectionId));

/** How many Projects of a Connection are listed, said as its collapsed name says it. */
export const countOf = (groups: ReadonlyArray<Group>, connectionId: string) => {
  const n = groups.filter((each) => each.connectionId === connectionId).length;
  return `${n} project${n === 1 ? '' : 's'}`;
};

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
