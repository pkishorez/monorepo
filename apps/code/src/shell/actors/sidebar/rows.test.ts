import type { Project, Session } from '@kestack/connect/code';
import { describe, expect, it } from 'vitest';
import type { OnMachine } from '../../machines/index.ts';
import { dayOf, recentOf, sessionBeside, timelineOf } from './rows.ts';

const project = (id: string, machineId = 'm1') =>
  ({ id, name: `Project ${id}`, machineId }) as OnMachine<Project>;
const session = (
  id: string,
  projectId: string,
  activeAt: number,
  settledAt: number | null = null,
  machineId = 'm1',
) => ({ id, projectId, activeAt, settledAt, machineId }) as OnMachine<Session>;

const HOUR = 60 * 60 * 1000;
// Noon, local time.
const now = new Date(2026, 9, 25, 12).getTime();

const recent = recentOf(
  [project('a'), project('b')],
  [
    session('a1', 'a', now - 2 * HOUR),
    session('b1', 'b', now - 30 * HOUR),
    session('a2', 'a', now - HOUR),
    // Settled: out of the timeline.
    session('b2', 'b', now, now),
    session('x1', 'gone', now - 40 * 24 * HOUR),
  ],
);
const beside = (sessionId: string | null, by: 1 | -1) =>
  sessionBeside(
    recent,
    sessionId === null ? null : { machineId: 'm1', sessionId },
    by,
  )?.id;

describe('the sidebar timeline', () => {
  it('is every unsettled session, most recently active first, named by its project', () => {
    expect(recent.map(({ session, project }) => [session.id, project])).toEqual(
      [
        ['a2', 'Project a'],
        ['a1', 'Project a'],
        ['b1', 'Project b'],
        ['x1', null],
      ],
    );
  });

  it('puts each under the day it was last active', () => {
    expect(
      timelineOf(recent, now).map(({ day, entries }) => [
        day,
        entries.map(({ session }) => session.id),
      ]),
    ).toEqual([
      ['Today', ['a2', 'a1']],
      ['Yesterday', ['b1']],
      ['Earlier', ['x1']],
    ]);
    expect(dayOf(now - 3 * 24 * HOUR, now)).toBe('Previous 7 days');
  });

  it('steps to the session beside, round past either end, from the ends from nowhere', () => {
    expect(beside('a1', 1)).toBe('b1');
    expect(beside('a2', -1)).toBe('x1');
    expect(beside('x1', 1)).toBe('a2');
    expect(beside(null, 1)).toBe('a2');
    expect(beside(null, -1)).toBe('x1');
  });

  it('keeps the same ids of two Machines apart', () => {
    const two = recentOf(
      [project('a'), project('a', 'm2')],
      [session('s', 'a', 1), session('s', 'a', 2, null, 'm2')],
    );
    expect(two.map(({ place }) => place)).toEqual(['s:m2/s', 's:m1/s']);
  });
});
