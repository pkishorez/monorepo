import { describe, expect, it } from 'vitest';
import type { Project, Session } from '@kestack/ai-toolkit/api';
import { countJobs, groupJobs, jobsBySession } from './group.ts';

const project = (id: string, name: string) =>
  ({ id, name, path: `/${name}`, createdAt: 0 }) as Project;
const session = (id: string, projectId: string, title: string, at: number) =>
  ({ id, projectId, title, createdAt: at }) as Session;
const job = (id: string, startedAt?: number) => ({
  id,
  kind: 'shell' as const,
  title: id,
  ...(startedAt === undefined ? {} : { startedAt }),
});

describe('groupJobs', () => {
  const projects = [project('p1', 'web'), project('p2', 'api')];
  const sessions = [
    session('s1', 'p1', 'Old', 1),
    session('s2', 'p1', 'New', 2),
    session('s3', 'p2', '', 3),
  ];

  it('groups by project by name, sessions newest first, jobs oldest first', () => {
    const groups = groupJobs(
      [
        {
          sessionId: 's1',
          projectId: 'p1',
          jobs: [job('b', 20), job('a', 10)],
        },
        { sessionId: 's2', projectId: 'p1', jobs: [job('c')] },
        { sessionId: 's3', projectId: 'p2', jobs: [job('d', 5)] },
      ],
      projects,
      sessions,
    );
    expect(groups).toEqual([
      {
        projectId: 'p2',
        name: 'api',
        sessions: [
          { sessionId: 's3', title: 'Untitled session', jobs: [job('d', 5)] },
        ],
      },
      {
        projectId: 'p1',
        name: 'web',
        sessions: [
          { sessionId: 's2', title: 'New', jobs: [job('c')] },
          {
            sessionId: 's1',
            title: 'Old',
            jobs: [job('a', 10), job('b', 20)],
          },
        ],
      },
    ]);
  });

  it('leaves out sessions without jobs, and names what it does not know', () => {
    expect(
      groupJobs(
        [
          { sessionId: 's1', projectId: 'p1', jobs: [] },
          { sessionId: 'sx', projectId: 'px', jobs: [job('e')] },
        ],
        projects,
        sessions,
      ),
    ).toEqual([
      {
        projectId: 'px',
        name: 'Unknown project',
        sessions: [
          { sessionId: 'sx', title: 'Untitled session', jobs: [job('e')] },
        ],
      },
    ]);
  });
});

describe('counting', () => {
  const list = [
    { sessionId: 's1', projectId: 'p1', jobs: [job('a'), job('b')] },
    { sessionId: 's2', projectId: 'p1', jobs: [] },
  ];

  it('counts every job, and each session with any', () => {
    expect(countJobs(list)).toBe(2);
    expect(countJobs([])).toBe(0);
    expect([...jobsBySession(list)]).toEqual([['s1', 2]]);
  });
});
