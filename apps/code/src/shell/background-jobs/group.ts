import type {
  BackgroundJob,
  Project,
  Session,
  SessionJobs,
} from '@kestack/ai-toolkit/api';
import type { OnMachine } from '../../replica/index.ts';

/*
 * Every Machine's list of Background Jobs, as the bubble lists them: by
 * project, by name; in each, by session, newest first; in each, by job,
 * oldest first. A session with no jobs is left out, as is a project left
 * with none. A project or session is named by its Machine and its id.
 */

type Jobs = OnMachine<SessionJobs>;

const keyOf = (machineId: string, id: string) => `${machineId}/${id}`;

export interface SessionGroup {
  readonly sessionId: string;
  readonly title: string;
  readonly jobs: ReadonlyArray<BackgroundJob>;
}

export interface ProjectGroup {
  readonly machineId: string;
  readonly projectId: string;
  readonly name: string;
  readonly sessions: ReadonlyArray<SessionGroup>;
}

/** How many jobs run across every session. */
export const countJobs = (list: ReadonlyArray<Jobs>) =>
  list.reduce((sum, { jobs }) => sum + jobs.length, 0);

/** How many jobs each session runs, by `machine id/session id`; a session with none is absent. */
export const jobsBySession = (list: ReadonlyArray<Jobs>) =>
  new Map(
    list
      .filter(({ jobs }) => jobs.length > 0)
      .map(
        ({ machineId, sessionId, jobs }) =>
          [keyOf(machineId, sessionId), jobs.length] as const,
      ),
  );

export const groupJobs = (
  list: ReadonlyArray<Jobs>,
  projects: ReadonlyArray<OnMachine<Project>>,
  sessions: ReadonlyArray<OnMachine<Session>>,
): ReadonlyArray<ProjectGroup> => {
  const projectOf = new Map(
    projects.map((each) => [keyOf(each.machineId, each.id), each]),
  );
  const sessionOf = new Map(
    sessions.map((each) => [keyOf(each.machineId, each.id), each]),
  );
  const session = (each: Jobs) =>
    sessionOf.get(keyOf(each.machineId, each.sessionId));
  const byProject = new Map<
    string,
    { readonly machineId: string; readonly projectId: string; own: Jobs[] }
  >();
  for (const each of list) {
    if (each.jobs.length === 0) continue;
    const key = keyOf(each.machineId, each.projectId);
    const group = byProject.get(key) ?? {
      machineId: each.machineId,
      projectId: each.projectId,
      own: [],
    };
    group.own.push(each);
    byProject.set(key, group);
  }
  return [...byProject]
    .map(([key, { machineId, projectId, own }]) => ({
      machineId,
      projectId,
      name: projectOf.get(key)?.name ?? 'Unknown project',
      sessions: [...own]
        .sort(
          (a, b) => (session(b)?.createdAt ?? 0) - (session(a)?.createdAt ?? 0),
        )
        .map((each) => ({
          sessionId: each.sessionId,
          title: session(each)?.title || 'Untitled session',
          jobs: [...each.jobs].sort(
            (a, b) =>
              (a.startedAt ?? Infinity) - (b.startedAt ?? Infinity) ||
              a.title.localeCompare(b.title),
          ),
        })),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
};
