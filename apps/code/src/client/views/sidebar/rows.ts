import type { Project, Session } from '@kestack/ai-toolkit/api';

/*
 * The sidebar's tree as rows: every project by name, each followed by its
 * sessions, newest first. Which projects are unfolded is the sidebar's own
 * state; only their sessions are shown, and only shown rows are stepped
 * through, by the cursor or by the next and previous session.
 */

export interface Row {
  /** Unique across the tree: `p:<id>` for a project, `s:<id>` for a session. */
  readonly place: string;
  readonly kind: 'project' | 'session';
  readonly projectId: string;
  readonly project: Project;
  /** Only on a session's row. */
  readonly session: Session | null;
}

export const projectPlace = (id: string) => `p:${id}`;
export const sessionPlace = (id: string) => `s:${id}`;

/** Every row, shown or not, in the sidebar's order. */
export function treeOf(
  projects: ReadonlyArray<Project>,
  sessions: ReadonlyArray<Session>,
): ReadonlyArray<Row> {
  return [...projects]
    .sort((a, b) => a.name.localeCompare(b.name))
    .flatMap((project) => [
      {
        place: projectPlace(project.id),
        kind: 'project' as const,
        projectId: project.id,
        project,
        session: null,
      },
      ...sessions
        .filter((session) => session.projectId === project.id)
        .sort((a, b) => b.createdAt - a.createdAt)
        .map((session) => ({
          place: sessionPlace(session.id),
          kind: 'session' as const,
          projectId: project.id,
          project,
          session,
        })),
    ]);
}

/** Whether a row is shown: a project always, a session under an unfolded one. */
export const shown = (row: Row, unfolded: ReadonlySet<string>) =>
  row.kind === 'project' || unfolded.has(row.projectId);

/**
 * The shown session `by` rows away from `from` in the sidebar's order,
 * across projects; from nowhere, the first or the last. Undefined past
 * either end.
 */
export function sessionBeside(
  rows: ReadonlyArray<Row>,
  unfolded: ReadonlySet<string>,
  from: string | null,
  by: 1 | -1,
): Row | undefined {
  const at = from === null ? -1 : rows.findIndex((row) => row.place === from);
  const start = at !== -1 ? at : by === 1 ? -1 : rows.length;
  for (let index = start + by; index >= 0 && index < rows.length; index += by) {
    const row = rows[index]!;
    if (row.kind === 'session' && shown(row, unfolded)) return row;
  }
  return undefined;
}
