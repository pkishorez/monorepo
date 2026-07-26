import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import type { StateMachineLayout } from '../types';
import { StateMachineSvg } from './state-machine-svg';
import { StateMachineSvgViewer } from './state-machine-svg-viewer';

const layout: StateMachineLayout = {
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
  ],
};

describe('StateMachineSvg', () => {
  it('applies semantic node and edge class names to visual elements', () => {
    const markup = renderToStaticMarkup(
      <StateMachineSvg
        layout={layout}
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
  });
});

describe('StateMachineSvgViewer', () => {
  it('provides native overflow when panning is disabled', () => {
    const markup = renderToStaticMarkup(
      <StateMachineSvgViewer layout={layout} interaction={{ pan: false }} />,
    );

    expect(markup).toContain('overflow-auto');
    expect(markup).toContain('min-width:536px');
    expect(markup).toContain('touch-action:auto');
  });

  it('hides overflow when panning is enabled', () => {
    const markup = renderToStaticMarkup(
      <StateMachineSvgViewer layout={layout} interaction={{ pan: true }} />,
    );

    expect(markup).toContain('overflow-hidden');
    expect(markup).not.toContain('min-width:536px');
    expect(markup).toContain('touch-action:none');
  });
});
