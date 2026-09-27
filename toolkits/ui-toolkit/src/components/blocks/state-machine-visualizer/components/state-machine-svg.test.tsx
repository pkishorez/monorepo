import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import type { StateMachineDiagram } from '../types';
import { StateMachineSvg } from './state-machine-svg';
import { StateMachineViewer } from './state-machine-viewer';

const diagram: StateMachineDiagram = {
  id: 'workflow',
  label: 'Workflow',
  width: 480,
  height: 100,
  nodes: [
    {
      id: 'initial-indicator',
      kind: 'initial',
      x: 0,
      y: 42,
      width: 16,
      height: 16,
    },
    {
      id: 'draft',
      path: ['draft'],
      kind: 'state',
      x: 64,
      y: 20,
      width: 120,
      height: 60,
      label: 'Draft',
      type: 'atomic',
      initial: true,
    },
    {
      id: 'review',
      path: ['review'],
      kind: 'state',
      x: 240,
      y: 20,
      width: 120,
      height: 60,
      label: 'Review',
      type: 'atomic',
    },
    {
      id: 'complete',
      path: ['complete'],
      kind: 'state',
      x: 416,
      y: 20,
      width: 64,
      height: 60,
      label: 'Complete',
      type: 'final',
    },
  ],
  edges: [
    {
      id: 'initial',
      source: 'initial-indicator',
      target: 'draft',
      sections: [
        {
          points: [
            { x: 16, y: 50 },
            { x: 64, y: 50 },
          ],
          target: true,
        },
      ],
      initial: true,
    },
    {
      id: 'submit',
      source: 'draft',
      target: 'review',
      sections: [
        {
          points: [
            { x: 184, y: 50 },
            { x: 240, y: 50 },
          ],
          target: true,
        },
      ],
      initial: false,
    },
    {
      id: 'approve',
      source: 'review',
      target: 'complete',
      sections: [
        {
          points: [
            { x: 360, y: 50 },
            { x: 416, y: 50 },
          ],
          target: true,
        },
      ],
      initial: false,
    },
  ],
};

describe('StateMachineSvg', () => {
  it('applies semantic node and edge class names to visual elements', () => {
    const markup = renderToStaticMarkup(
      <StateMachineSvg
        diagram={diagram}
        classNames={{
          node: ({ role }) => `node-${role}`,
          edge: ({ role }) => `edge-${role}`,
        }}
      />,
    );

    expect(markup).toContain('node-initial-indicator');
    expect(markup).toContain('node-initial');
    expect(markup).toContain('node-intermediate');
    expect(markup).toContain('node-final');
    expect(markup).toContain('edge-initial-arrow');
    expect(markup).toContain('edge-transition');
    expect(markup).toContain('fill="context-stroke"');
    expect(markup).toContain('aria-label="Final state"');
    expect(markup).toContain('border-double');
    expect(markup).toContain('border-border/50');
    expect(markup).toContain('stroke="var(--foreground)"');
    expect(markup).not.toContain('text-chart-6');
    expect(markup).not.toContain('text-positive');
    expect(markup).not.toContain('stroke="var(--positive)"');
  });
});

describe('StateMachineViewer', () => {
  it('makes state nodes keyboard-selectable in the default click mode', () => {
    const markup = renderToStaticMarkup(
      <StateMachineViewer diagram={diagram} />,
    );

    expect(markup).toContain('role="button"');
    expect(markup).toContain('tabindex="0"');
    expect(markup).toContain('aria-label="Focus Draft state"');
    expect(markup).toContain('overflow-hidden');
    expect(markup).toContain('user-select:none');
    expect(markup).toContain('aria-label="Zoom in"');
    expect(markup).toContain('aria-label="Zoom out"');
  });

  it('passes grouped focus details to class name customization', () => {
    const markup = renderToStaticMarkup(
      <StateMachineViewer
        diagram={diagram}
        focus={{ mode: 'active-state', value: 'review' }}
        classNames={{
          node: ({ highlight }) =>
            highlight.kind === 'connected'
              ? `node-${highlight.direction}`
              : `node-${highlight.kind}`,
          edge: ({ highlight }) =>
            highlight.kind === 'connected'
              ? `edge-${highlight.direction}`
              : `edge-${highlight.kind}`,
        }}
      />,
    );

    expect(markup).toContain('node-focused');
    expect(markup).toContain('node-dimmed');
    expect(markup).toContain('node-outgoing');
    expect(markup).toContain('edge-dimmed');
    expect(markup).toContain('edge-outgoing');
  });

  it('emphasizes the selected node and its outgoing connections', () => {
    const markup = renderToStaticMarkup(
      <StateMachineViewer
        diagram={diagram}
        focus={{ mode: 'highlight', nodeId: 'review' }}
        classNames={{
          node: ({ node, highlight }) => `${node.id}-${highlight.kind}`,
          edge: ({ edge, highlight }) => `${edge.id}-${highlight.kind}`,
        }}
      />,
    );

    expect(markup).toContain('review-focused');
    expect(markup).toContain('draft-dimmed');
    expect(markup).toContain('complete-connected');
    expect(markup).toContain('submit-dimmed');
    expect(markup).toContain('approve-connected');
    expect(markup).toContain('outline-primary');
  });

  it('centers a followed highlighted node without changing zoom', () => {
    const markup = renderToStaticMarkup(
      <StateMachineViewer
        diagram={diagram}
        focus={{ mode: 'highlight', nodeId: 'review', follow: true }}
      />,
    );

    expect(markup).toContain('viewBox="32 -28 536 156"');
    expect(markup).not.toContain('cursor-grab');
    expect(markup).not.toContain('user-select:none');
  });

  it('provides native overflow when panning is disabled', () => {
    const markup = renderToStaticMarkup(
      <StateMachineViewer diagram={diagram} navigation={{ pan: false }} />,
    );

    expect(markup).toContain('overflow-auto');
    expect(markup).toContain('min-width:536px');
    expect(markup).toContain('touch-action:auto');
    expect(markup).not.toContain('user-select:none');
  });

  it('hides overflow when panning is enabled', () => {
    const markup = renderToStaticMarkup(
      <StateMachineViewer diagram={diagram} navigation={{ pan: true }} />,
    );

    expect(markup).toContain('overflow-hidden');
    expect(markup).not.toContain('min-width:536px');
    expect(markup).toContain('touch-action:none');
    expect(markup).toContain('user-select:none');
  });

  it('disables panning and centers the active state without changing zoom', () => {
    const markup = renderToStaticMarkup(
      <StateMachineViewer
        diagram={diagram}
        focus={{ mode: 'active-state', value: 'review' }}
        navigation={{ pan: true, zoom: true }}
      />,
    );

    expect(markup).toContain('overflow-hidden');
    expect(markup).toContain('viewBox="32 -28 536 156"');
    expect(markup).not.toContain('cursor-grab');
    expect(markup).not.toContain('user-select:none');
  });
});
