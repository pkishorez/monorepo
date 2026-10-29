import type { Project, Session } from '@kestack/connect/code';
import { describe, expect, it } from 'vitest';
import type { OnConnection } from '../../../../../connection/records/index.ts';
import {
  branchShown,
  groupedOf,
  namesOf,
  sessionBeside,
  shortNameOf,
} from '../rows.ts';

const project = (id: string, connectionId = 'm1') =>
  ({ id, name: `Project ${id}`, connectionId }) as OnConnection<Project>;
const session = (
  id: string,
  projectId: string,
  activeAt: number,
  settledAt: number | null = null,
  connectionId = 'm1',
) =>
  ({
    id,
    projectId,
    activeAt,
    settledAt,
    connectionId,
  }) as OnConnection<Session>;

const HOUR = 60 * 60 * 1000;
// Noon, local time.
const now = new Date(2026, 9, 25, 12).getTime();

const grouped = groupedOf(
  [project('a'), project('b'), project('c')],
  [
    session('a1', 'a', now - 3 * HOUR),
    session('b1', 'b', now - 2 * HOUR),
    session('a2', 'a', now - HOUR),
    session('b2', 'b', now - 30 * HOUR),
    // Settled: out of the list, and its Project with it.
    session('c1', 'c', now, now),
    session('x1', 'gone', now - 40 * 24 * HOUR),
  ],
);
const beside = (sessionId: string | null, by: 1 | -1) =>
  sessionBeside(
    grouped,
    sessionId === null ? null : { connectionId: 'm1', sessionId },
    by,
  )?.id;

describe('the sidebar by Project', () => {
  it('lists each Project with an unsettled session, by its most recently active one, its sessions so too', () => {
    expect(
      grouped.map(({ place, name, sessions }) => [
        place,
        name,
        sessions.map(({ session }) => session.id),
      ]),
    ).toEqual([
      ['p:m1/a', 'Project a', ['a2', 'a1']],
      ['p:m1/b', 'Project b', ['b1', 'b2']],
      ['p:m1/gone', null, ['x1']],
    ]);
  });

  it('steps to the session beside in the order drawn, round past either end, from the ends from nowhere', () => {
    // a2 is the most recent, b1 more recent than a1: drawn order wins.
    expect(beside('a2', 1)).toBe('a1');
    expect(beside('a1', 1)).toBe('b1');
    expect(beside('b2', 1)).toBe('x1');
    expect(beside('a2', -1)).toBe('x1');
    expect(beside('x1', 1)).toBe('a2');
    expect(beside(null, 1)).toBe('a2');
    expect(beside(null, -1)).toBe('x1');
  });

  it('keeps the same ids of two Connections apart', () => {
    const two = groupedOf(
      [project('a'), project('a', 'm2')],
      [session('s', 'a', 1), session('s', 'a', 2, null, 'm2')],
    );
    expect(
      two.map(({ place, sessions }) => [
        place,
        sessions.map(({ place }) => place),
      ]),
    ).toEqual([
      ['p:m2/a', ['s:m2/s']],
      ['p:m1/a', ['s:m1/s']],
    ]);
  });

  it('groups by Connection while every one is shown and there are several, each named once', () => {
    const listed = [
      { id: 'm1', name: 'Kishores-MacBook-Pro-2 (dev-code-worktrees)' },
      { id: 'm2', name: 'Kishores-MacBook-Pro-2 (demo-studio)' },
    ];
    const drawn = (names: ReadonlyMap<string, string> | null) =>
      groupedOf(
        [project('a'), project('b'), project('c', 'm2')],
        [
          session('a1', 'a', 1),
          session('c1', 'c', 2, null, 'm2'),
          session('b1', 'b', 3),
        ],
        names,
      ).map(({ name, connection }) => [connection, name]);
    // m1 is the most recently active; its Projects stay together.
    expect(drawn(namesOf(listed, null))).toEqual([
      ['dev-code-worktrees', 'Project b'],
      [null, 'Project a'],
      ['demo-studio', 'Project c'],
    ]);
    expect(namesOf(listed, 'm2')).toBeNull();
    expect(namesOf(listed.slice(0, 1), null)).toBeNull();
    // Unnamed, the Projects of every Connection mix, by activity alone.
    expect(drawn(null)).toEqual([
      [null, 'Project b'],
      [null, 'Project c'],
      [null, 'Project a'],
    ]);
  });

  it('steps through the Sessions in the order drawn by Connection', () => {
    const groups = groupedOf(
      [project('a'), project('c'), project('b', 'm2')],
      [
        session('a1', 'a', 1),
        session('b1', 'b', 2, null, 'm2'),
        session('c1', 'c', 3),
      ],
      namesOf(
        [
          { id: 'm1', name: 'one' },
          { id: 'm2', name: 'two' },
        ],
        null,
      ),
    );
    expect(
      sessionBeside(groups, { connectionId: 'm1', sessionId: 'c1' }, 1)?.id,
    ).toBe('a1');
  });

  it('names a Connection as it was served, else in full', () => {
    expect(shortNameOf('Kishores-MacBook-Pro-2 (demo-studio)')).toBe(
      'demo-studio',
    );
    expect(shortNameOf('Kishores-MacBook-Pro-2')).toBe(
      'Kishores-MacBook-Pro-2',
    );
  });

  it("says a branch Code made for a Worktree without Code's prefix", () => {
    expect(branchShown('ke-code/reply-ok')).toEqual({
      text: 'reply-ok',
      worktree: true,
    });
    expect(branchShown('main')).toEqual({ text: 'main', worktree: false });
    expect(branchShown('feat/ke-code/x')).toEqual({
      text: 'feat/ke-code/x',
      worktree: false,
    });
  });
});
