import type {
  BackgroundJob,
  Project,
  Session,
  SessionJobs,
} from '@kestack/ai-toolkit/api';

/*
 * The server's list of Background Jobs, as the bubble lists them: by
 * project, by name; in each, by session, newest first; in each, by job,
 * oldest first. A session with no jobs is left out, as is a project left
 * with none.
 */

export interface SessionGroup {
  readonly sessionId: string;
  readonly title: string;
  readonly jobs: ReadonlyArray<BackgroundJob>;
}

export interface ProjectGroup {
  readonly projectId: string;
  readonly name: string;
  readonly sessions: ReadonlyArray<SessionGroup>;
}

/** How many jobs run across every session. */
export const countJobs = (list: ReadonlyArray<SessionJobs>) =>
  list.reduce((sum, { jobs }) => sum + jobs.length, 0);

/** How many jobs each session runs, by session id; a session with none is absent. */
export const jobsBySession = (list: ReadonlyArray<SessionJobs>) =>
  new Map(
    list
      .filter(({ jobs }) => jobs.length > 0)
      .map(({ sessionId, jobs }) => [sessionId, jobs.length] as const),
  );

export const groupJobs = (
  list: ReadonlyArray<SessionJobs>,
  projects: ReadonlyArray<Project>,
  sessions: ReadonlyArray<Session>,
): ReadonlyArray<ProjectGroup> => {
  const projectOf = new Map(projects.map((each) => [each.id, each]));
  const sessionOf = new Map(sessions.map((each) => [each.id, each]));
  const byProject = new Map<string, Array<SessionJobs>>();
  for (const each of list) {
    if (each.jobs.length === 0) continue;
    byProject.set(each.projectId, [
      ...(byProject.get(each.projectId) ?? []),
      each,
    ]);
  }
  return [...byProject]
    .map(([projectId, own]) => ({
      projectId,
      name: projectOf.get(projectId)?.name ?? 'Unknown project',
      sessions: [...own]
        .sort(
          (a, b) =>
            (sessionOf.get(b.sessionId)?.createdAt ?? 0) -
            (sessionOf.get(a.sessionId)?.createdAt ?? 0),
        )
        .map(({ sessionId, jobs }) => ({
          sessionId,
          title: sessionOf.get(sessionId)?.title || 'Untitled session',
          jobs: [...jobs].sort(
            (a, b) =>
              (a.startedAt ?? Infinity) - (b.startedAt ?? Infinity) ||
              a.title.localeCompare(b.title),
          ),
        })),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
};
