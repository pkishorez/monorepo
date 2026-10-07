import { describe, expect, it } from 'vitest';

import { makeParticipantHierarchy } from './participant-hierarchy';

describe('makeParticipantHierarchy', () => {
  it('keeps related paths contiguous in depth-first first-appearance order', () => {
    const hierarchy = makeParticipantHierarchy([
      'browser:alice/todos/worker',
      'backend',
      'browser:alice',
      'browser:alice/comments/worker',
    ]);

    expect(
      hierarchy.columns.map((column) =>
        column.kind === 'participant' ? column.participantName : column.key,
      ),
    ).toEqual([
      'browser:alice',
      'browser:alice/todos/worker',
      'browser:alice/comments/worker',
      'backend',
    ]);
    expect(
      hierarchy.headerCells.some(
        (cell) => cell.kind === 'self' && cell.path === 'browser:alice',
      ),
    ).toBe(true);
  });

  it('keeps a parent lane when collapsed and replaces a hidden subtree', () => {
    const participants = ['browser', 'browser/tab/query', 'browser/tab/worker'];
    const collapsed = makeParticipantHierarchy(participants, {
      collapsedPaths: new Set(['browser']),
    });
    const hidden = makeParticipantHierarchy(participants, {
      hiddenPaths: new Set(['browser/tab']),
    });

    expect(collapsed.columns).toMatchObject([
      {
        kind: 'participant',
        participantName: 'browser',
        collapsedCount: 2,
      },
    ]);
    expect(hidden.columns).toMatchObject([
      { kind: 'participant', participantName: 'browser' },
      {
        kind: 'marker',
        marker: 'hidden',
        participantCount: 2,
        path: 'browser/tab',
      },
    ]);
  });

  it('uses a marker when a collapsed group has no Participant of its own', () => {
    const hierarchy = makeParticipantHierarchy(
      ['browser/tab/query', 'browser/tab/worker'],
      { collapsedPaths: new Set(['browser/tab']) },
    );

    expect(hierarchy.columns).toMatchObject([
      {
        kind: 'marker',
        marker: 'collapsed',
        participantCount: 2,
        path: 'browser/tab',
      },
    ]);
  });

  it('hides a parent Participant lane without hiding its sibling descendants', () => {
    const hierarchy = makeParticipantHierarchy(
      ['browser', 'browser/tab/query', 'browser/tab/worker'],
      { hiddenParticipantNames: new Set(['browser']) },
    );

    expect(hierarchy.visibleParticipants).toEqual(
      new Set(['browser/tab/query', 'browser/tab/worker']),
    );
    expect(hierarchy.columns).toMatchObject([
      { kind: 'marker', marker: 'participant', path: 'browser' },
      { kind: 'participant', participantName: 'browser/tab/query' },
      { kind: 'participant', participantName: 'browser/tab/worker' },
    ]);
    expect(hierarchy.headerCells).toContainEqual(
      expect.objectContaining({
        kind: 'marker',
        marker: 'participant',
        path: 'browser',
      }),
    );
  });
});
