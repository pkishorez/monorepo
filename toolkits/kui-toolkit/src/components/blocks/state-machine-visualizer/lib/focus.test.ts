import { describe, expect, it } from 'vitest';

import type { StateMachineDiagram } from '../types';
import {
  createSelectionTargets,
  getFocusHighlights,
  getFocusedCenter,
  resolveActiveNodeIds,
} from './focus';

const diagram: StateMachineDiagram = {
  id: 'workflow',
  label: 'Workflow',
  width: 500,
  height: 300,
  nodes: [
    {
      id: 'workflow.initial',
      kind: 'initial',
      x: 0,
      y: 20,
      width: 14,
      height: 14,
    },
    {
      id: 'workflow.idle',
      path: ['idle'],
      kind: 'state',
      x: 40,
      y: 0,
      width: 100,
      height: 60,
    },
    {
      id: 'workflow.running',
      path: ['running'],
      kind: 'state',
      x: 180,
      y: 0,
      width: 140,
      height: 200,
      container: true,
    },
    {
      id: 'custom-loading-id',
      path: ['running', 'loading'],
      parentId: 'workflow.running',
      kind: 'state',
      x: 200,
      y: 80,
      width: 100,
      height: 60,
    },
    {
      id: 'workflow.done',
      path: ['done'],
      kind: 'state',
      x: 360,
      y: 0,
      width: 100,
      height: 60,
    },
  ],
  edges: [
    {
      id: 'initial',
      source: 'workflow.initial',
      target: 'workflow.idle',
      sections: [],
      initial: true,
    },
    {
      id: 'start',
      source: 'workflow.idle',
      target: 'custom-loading-id',
      sections: [],
      initial: false,
    },
    {
      id: 'cancel',
      source: 'custom-loading-id',
      target: 'workflow.idle',
      sections: [],
      initial: false,
    },
    {
      id: 'finish',
      source: 'custom-loading-id',
      target: 'workflow.done',
      sections: [],
      initial: false,
    },
  ],
};

describe('state machine focus', () => {
  it('resolves nested state values by path instead of XState node ID', () => {
    expect([...resolveActiveNodeIds(diagram, { running: 'loading' })]).toEqual([
      'custom-loading-id',
    ]);
  });

  it('resolves every active leaf in a parallel state value', () => {
    const parallelDiagram: StateMachineDiagram = {
      ...diagram,
      nodes: [
        ...diagram.nodes,
        {
          id: 'review.legal.approved',
          path: ['review', 'legal', 'approved'],
          kind: 'state',
          x: 0,
          y: 220,
          width: 100,
          height: 60,
        },
        {
          id: 'review.security.pending',
          path: ['review', 'security', 'pending'],
          kind: 'state',
          x: 140,
          y: 220,
          width: 100,
          height: 60,
        },
      ],
    };

    expect([
      ...resolveActiveNodeIds(parallelDiagram, {
        review: { legal: 'approved', security: 'pending' },
      }),
    ]).toEqual(['review.legal.approved', 'review.security.pending']);
  });

  it('highlights only direct outgoing connections', () => {
    const highlights = getFocusHighlights(
      diagram,
      new Set(['custom-loading-id']),
    );

    expect(highlights.nodes.get('custom-loading-id')).toEqual({
      kind: 'focused',
    });
    expect(highlights.nodes.get('workflow.idle')).toEqual({
      kind: 'connected',
      direction: 'outgoing',
    });
    expect(highlights.nodes.get('workflow.done')).toEqual({
      kind: 'connected',
      direction: 'outgoing',
    });
    expect(highlights.nodes.get('workflow.running')).toEqual({
      kind: 'dimmed',
    });
    expect(highlights.edges.get('start')).toEqual({
      kind: 'dimmed',
    });
    expect(highlights.edges.get('cancel')).toEqual({
      kind: 'connected',
      direction: 'outgoing',
    });
    expect(highlights.edges.get('finish')).toEqual({
      kind: 'connected',
      direction: 'outgoing',
    });
  });

  it('keeps nested wrappers visible without highlighting their other nodes', () => {
    const nestedDiagram: StateMachineDiagram = {
      ...diagram,
      nodes: [
        ...diagram.nodes,
        {
          id: 'workflow.review',
          path: ['review'],
          kind: 'state',
          type: 'compound',
          container: true,
          x: 0,
          y: 0,
          width: 400,
          height: 300,
        },
        {
          id: 'workflow.review.checks',
          path: ['review', 'checks'],
          parentId: 'workflow.review',
          kind: 'state',
          type: 'parallel',
          container: true,
          x: 20,
          y: 60,
          width: 360,
          height: 220,
        },
        {
          id: 'workflow.review.checks.legal',
          path: ['review', 'checks', 'legal'],
          parentId: 'workflow.review.checks',
          kind: 'state',
          type: 'atomic',
          x: 40,
          y: 120,
          width: 100,
          height: 60,
        },
        {
          id: 'workflow.review.checks.security',
          path: ['review', 'checks', 'security'],
          parentId: 'workflow.review.checks',
          kind: 'state',
          type: 'atomic',
          x: 180,
          y: 120,
          width: 100,
          height: 60,
        },
      ],
    };
    const highlights = getFocusHighlights(
      nestedDiagram,
      new Set(['workflow.review.checks.legal']),
    );

    expect(highlights.nodes.get('workflow.review.checks.legal')).toEqual({
      kind: 'focused',
    });
    expect(highlights.nodes.get('workflow.review.checks')).toEqual({
      kind: 'idle',
    });
    expect(highlights.nodes.get('workflow.review')).toEqual({
      kind: 'idle',
    });
    expect(highlights.nodes.get('workflow.review.checks.security')).toEqual({
      kind: 'dimmed',
    });
  });

  it('treats a self-transition as outgoing while keeping its node focused', () => {
    const selfTransitionDiagram: StateMachineDiagram = {
      ...diagram,
      edges: [
        ...diagram.edges,
        {
          id: 'retry',
          source: 'custom-loading-id',
          target: 'custom-loading-id',
          sections: [],
          initial: false,
        },
      ],
    };
    const highlights = getFocusHighlights(
      selfTransitionDiagram,
      new Set(['custom-loading-id']),
    );

    expect(highlights.nodes.get('custom-loading-id')).toEqual({
      kind: 'focused',
    });
    expect(highlights.edges.get('retry')).toEqual({
      kind: 'connected',
      direction: 'outgoing',
    });
  });

  it('narrows focus to the hovered outgoing connection', () => {
    const highlights = getFocusHighlights(
      diagram,
      new Set(['custom-loading-id']),
      'workflow.done',
    );

    expect(highlights.nodes.get('custom-loading-id')).toEqual({
      kind: 'focused',
    });
    expect(highlights.nodes.get('workflow.done')).toEqual({
      kind: 'connected',
      direction: 'outgoing',
    });
    expect(highlights.nodes.get('workflow.idle')).toEqual({
      kind: 'dimmed',
    });
    expect(highlights.edges.get('finish')).toEqual({
      kind: 'connected',
      direction: 'outgoing',
    });
    expect(highlights.edges.get('cancel')).toEqual({
      kind: 'dimmed',
    });
  });

  it('ignores hover on a node that is not an outgoing connection', () => {
    const highlights = getFocusHighlights(
      diagram,
      new Set(['workflow.idle']),
      'workflow.done',
    );

    expect(highlights.nodes.get('custom-loading-id')).toEqual({
      kind: 'connected',
      direction: 'outgoing',
    });
    expect(highlights.edges.get('start')).toEqual({
      kind: 'connected',
      direction: 'outgoing',
    });
  });

  it('centers the collective bounds of parallel active states', () => {
    expect(
      getFocusedCenter(diagram, new Set(['workflow.idle', 'workflow.done'])),
    ).toEqual({ x: 250, y: 30 });
  });
});

describe('createSelectionTargets', () => {
  const wrappedDiagram: StateMachineDiagram = {
    id: 'review',
    label: 'Review',
    width: 300,
    height: 200,
    nodes: [
      {
        id: 'review',
        path: ['review'],
        kind: 'state',
        type: 'compound',
        container: true,
        x: 0,
        y: 0,
        width: 300,
        height: 200,
        label: 'Review',
      },
      {
        id: 'review.pending',
        path: ['review', 'pending'],
        parentId: 'review',
        kind: 'state',
        type: 'atomic',
        initial: true,
        x: 20,
        y: 60,
        width: 100,
        height: 60,
        label: 'Pending',
      },
      {
        id: 'review.approved',
        path: ['review', 'approved'],
        parentId: 'review',
        kind: 'state',
        type: 'atomic',
        x: 160,
        y: 60,
        width: 100,
        height: 60,
        label: 'Approved',
      },
    ],
    edges: [],
  };

  it('resolves wrapper selection to its initial child state', () => {
    const targets = createSelectionTargets(wrappedDiagram);

    expect(targets.get('review')?.id).toBe('review.pending');
    expect(targets.get('review.pending')?.id).toBe('review.pending');
    expect(targets.get('review.approved')?.id).toBe('review.approved');
  });
});
