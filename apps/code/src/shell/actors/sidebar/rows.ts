import type {
  Project as ProjectRecord,
  Session as SessionRecord,
} from '@kestack/connect/code';
import type { OnMachine } from '../../replica/index.ts';

type Project = OnMachine<ProjectRecord>;
type Session = OnMachine<SessionRecord>;

/*
 * The sidebar as rows: every Project of every Machine, as one list, the
 * most recently active first, each
 * a heading followed by its unsettled Sessions, the most recently active
 * first. Activity is a Turn starting or a Session being made, never
 * viewing, so the order holds while you browse. The open Project shows all
 * its Sessions, as does one shown whole; any other its three most recent,
 * then one "+N" row for the rest. Every Session, shown or not, has its
 * place in the sidebar's order, which the next and previous session follow.
 * A Project or Session is named by its Machine and its id together.
 */

/** How many Sessions a Project that is not open shows before "+N". */
export const SHOWN = 3;

export type Row =
  | {
      readonly kind: 'project';
      /** Unique across the sidebar: `p:<machine id>/<id>`. */
      readonly place: string;
      readonly project: Project;
    }
  | {
      readonly kind: 'session';
      /** `s:<machine id>/<id>`. */
      readonly place: string;
      readonly project: Project;
      readonly session: Session;
    }
  | {
      readonly kind: 'more';
      /** `m:<machine id>/<project id>`. */
      readonly place: string;
      readonly project: Project;
      /** How many of its Sessions it stands for. */
      readonly hidden: number;
    };

/** What names a Project or Session across Machines. */
export interface Of {
  readonly machineId: string;
  readonly id: string;
}

/** A Project's or Session's name across Machines, as one key. */
export const keyOf = ({ machineId, id }: Of) => `${machineId}/${id}`;

export const projectPlace = (of: Of) => `p:${keyOf(of)}`;
export const sessionPlace = (of: Of) => `s:${keyOf(of)}`;
const morePlace = (of: Of) => `m:${keyOf(of)}`;

const projectOf = ({ machineId, projectId }: Session): Of => ({
  machineId,
  id: projectId,
});

/** When a Project was last active: its latest Session's, else when it was added. */
const activeAt = (project: Project, own: ReadonlyArray<Session>) =>
  own.length === 0
    ? project.createdAt
    : Math.max(...own.map(({ activeAt }) => activeAt));

/**
 * Every Project with its unsettled Sessions, in the sidebar's order. Its
 * Settled Sessions count toward when it was last active.
 */
export function groupsOf(
  projects: ReadonlyArray<Project>,
  sessions: ReadonlyArray<Session>,
) {
  const by = Map.groupBy(sessions, (session) => keyOf(projectOf(session)));
  return projects
    .map((project) => {
      const own = by.get(keyOf(project)) ?? [];
      return {
        project,
        at: activeAt(project, own),
        sessions: own
          .filter(({ settledAt }) => settledAt === null)
          .sort((a, b) => b.activeAt - a.activeAt),
      };
    })
    .sort((a, b) => b.at - a.at)
    .map(({ project, sessions }) => ({ project, sessions }));
}

/**
 * The rows shown: every Project, with all its Sessions when it is `open`
 * or `whole`, else its first three and "+N".
 */
export function rowsOf(
  groups: ReturnType<typeof groupsOf>,
  /** Whether a Project, by `keyOf`, shows all its Sessions. */
  shownWhole: (project: string) => boolean,
): ReadonlyArray<Row> {
  return groups.flatMap(({ project, sessions }) => {
    const shown = shownWhole(keyOf(project))
      ? sessions
      : sessions.slice(0, SHOWN);
    const hidden = sessions.length - shown.length;
    return [
      { kind: 'project' as const, place: projectPlace(project), project },
      ...shown.map((session) => ({
        kind: 'session' as const,
        place: sessionPlace(session),
        project,
        session,
      })),
      ...(hidden === 0
        ? []
        : [
            {
              kind: 'more' as const,
              place: morePlace(project),
              project,
              hidden,
            },
          ]),
    ];
  });
}

/**
 * The Session `by` places from where you are in the sidebar's order, shown
 * or not, across Projects: from a Session, or from a Project, as if just
 * above its first Session; from nowhere, the first or the last. Past
 * either end it goes round to the other; undefined only when there is no
 * other Session.
 */
export function sessionBeside(
  groups: ReturnType<typeof groupsOf>,
  from: {
    readonly machineId: string;
    readonly projectId: string;
    readonly sessionId: string | null;
  } | null,
  by: 1 | -1,
): Session | undefined {
  const order = groups.flatMap(({ project, sessions }) => [
    { project, session: null },
    ...sessions.map((session) => ({ project, session })),
  ]);
  const at =
    from === null
      ? -1
      : order.findIndex(({ project, session }) =>
          from.sessionId === null
            ? session === null &&
              project.machineId === from.machineId &&
              project.id === from.projectId
            : session?.machineId === from.machineId &&
              session.id === from.sessionId,
        );
  const start = at !== -1 ? at : by === 1 ? -1 : order.length;
  for (let step = 1; step <= order.length; step++) {
    const index =
      (((start + by * step) % order.length) + order.length) % order.length;
    if (index === at) break;
    const { session } = order[index]!;
    if (session !== null) return session;
  }
  return undefined;
}
