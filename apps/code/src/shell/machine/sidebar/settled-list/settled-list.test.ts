import type { Project, Session } from '@kestack/ai-toolkit/api';
import { describe, expect, it } from 'vitest';
import { settledOf } from './settled-list.tsx';

const project = (id: string) =>
  ({ id, name: `${id} project`, path: `/${id}`, createdAt: 0 }) as Project;
const session = (id: string, projectId: string, settledAt: number | null) =>
  ({ id, projectId, settledAt }) as Session;

describe('the Settled List', () => {
  it('holds only Settled sessions, the most recently Settled first, each with its project', () => {
    const listed = settledOf(
      [project('a'), project('b')],
      [
        session('s1', 'a', 10),
        session('s2', 'b', null),
        session('s3', 'b', 30),
        session('s4', 'gone', 20),
      ],
    );
    expect(listed.map(({ session, project }) => [session.id, project])).toEqual(
      [
        ['s3', 'b project'],
        ['s4', null],
        ['s1', 'a project'],
      ],
    );
  });
});
