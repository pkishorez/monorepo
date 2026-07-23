import { describe, expect, it } from 'vitest';
import type { StoryRun } from 'laymos/report';

import type {
  ProgressiveStoryGraphModel,
  StoryExecutionCoverage,
} from '../lib/model';
import {
  executionCoverageStatus,
  primaryStory,
  relatedNodeIds,
} from './story-canvas';

const location = { file: 'story.ts', line: 1, column: 1 };

const story = {
  generatedAt: 0,
  name: 'Primary descendants',
  description: 'Keeps primary work nested beneath hidden details.',
  blocks: {
    hiddenFlow: {
      kind: 'flow',
      name: 'Hidden flow',
      description: '',
      location,
      visibility: 'detail',
    },
    hiddenDecision: {
      kind: 'decision',
      name: 'Hidden decision',
      description: '',
      location,
      visibility: 'detail',
      arms: [],
    },
    first: {
      kind: 'step',
      name: 'First',
      description: '',
      location,
      visibility: 'primary',
    },
    second: {
      kind: 'step',
      name: 'Second',
      description: '',
      location,
      visibility: 'primary',
    },
  },
  scenarios: [
    {
      name: 'Scenario',
      description: '',
      location,
      outcome: 'succeeded',
      failures: [],
      execution: [
        {
          blockId: 'hiddenFlow',
          outcome: 'succeeded',
          startOffsetMillis: 0,
          durationMillis: 1,
          children: [
            {
              blockId: 'hiddenDecision',
              outcome: 'succeeded',
              startOffsetMillis: 0,
              durationMillis: 1,
              children: [
                {
                  parallel: [
                    [
                      {
                        blockId: 'first',
                        outcome: 'succeeded',
                        startOffsetMillis: 0,
                        durationMillis: 1,
                        children: [],
                      },
                    ],
                    [
                      {
                        blockId: 'second',
                        outcome: 'succeeded',
                        startOffsetMillis: 0,
                        durationMillis: 1,
                        children: [],
                      },
                    ],
                  ],
                },
              ],
            },
          ],
        },
      ],
    },
  ],
} satisfies StoryRun;

describe('primaryStory', () => {
  it('promotes primary descendants through hidden flows and decisions', () => {
    const primary = primaryStory(story);

    expect(Object.keys(primary.blocks)).toEqual([
      'hiddenFlow',
      'first',
      'second',
    ]);
    expect(primary.scenarios[0]?.execution).toEqual([
      {
        blockId: 'hiddenFlow',
        outcome: 'succeeded',
        startOffsetMillis: 0,
        durationMillis: 1,
        children: [
          {
            parallel: [
              [expect.objectContaining({ blockId: 'first' })],
              [expect.objectContaining({ blockId: 'second' })],
            ],
          },
        ],
      },
    ]);
  });
});

describe('relatedNodeIds', () => {
  it('includes the owning Decision when a connected Arm is highlighted', () => {
    const model = {
      nodes: [
        {
          kind: 'block',
          id: 'decision',
          blockId: 'decision',
          block: {
            kind: 'decision',
            name: 'Validate shape',
            description: '',
            location,
            arms: [
              {
                kind: 'literal',
                value: 'invalid',
                name: 'Invalid shape',
                description: '',
              },
            ],
          },
          observedArms: [],
        },
        {
          kind: 'arm',
          id: 'invalid-arm',
          decisionId: 'decision',
          arm: {
            kind: 'literal',
            value: 'invalid',
            name: 'Invalid shape',
            description: '',
          },
          active: true,
        },
        {
          kind: 'block',
          id: 'terminal',
          blockId: 'terminal',
          block: {
            kind: 'terminal',
            name: 'Configuration export is invalid',
            description: '',
            location,
            completion: {
              kind: 'error',
              error: 'ConfigValidationError',
            },
          },
          observedArms: [],
        },
        {
          kind: 'block',
          id: 'unrelated',
          blockId: 'unrelated',
          block: {
            kind: 'step',
            name: 'Discover Laymos surfaces',
            description: '',
            location,
          },
          observedArms: [],
        },
      ],
      edges: [
        {
          id: 'decision->invalid-arm',
          source: 'decision',
          target: 'invalid-arm',
          inactive: false,
        },
        {
          id: 'invalid-arm->terminal',
          source: 'invalid-arm',
          target: 'terminal',
          inactive: false,
        },
      ],
      childrenByNode: {},
    } satisfies ProgressiveStoryGraphModel;

    expect(relatedNodeIds(model, 'terminal', true)).toEqual(
      new Set(['terminal', 'invalid-arm', 'decision']),
    );
    expect(relatedNodeIds(model, 'terminal')).toEqual(
      new Set(['terminal', 'invalid-arm']),
    );
  });
});

describe('executionCoverageStatus', () => {
  const coverage = (
    blocks: StoryExecutionCoverage['blocks'],
    arms: StoryExecutionCoverage['arms'],
  ): StoryExecutionCoverage => ({
    blocks,
    arms,
    coveredNodeIds: new Set(),
    observedEdgeIds: new Set(),
    targetKinds: new Map(),
  });

  it('reports the actual aggregate coverage state', () => {
    expect(
      executionCoverageStatus(
        coverage({ covered: 4, total: 4 }, { covered: 2, total: 2 }),
      ),
    ).toBe('covered');
    expect(
      executionCoverageStatus(
        coverage({ covered: 3, total: 4 }, { covered: 1, total: 2 }),
      ),
    ).toBe('partial');
    expect(
      executionCoverageStatus(
        coverage({ covered: 0, total: 4 }, { covered: 0, total: 2 }),
      ),
    ).toBe('uncovered');
    expect(
      executionCoverageStatus(
        coverage({ covered: 0, total: 0 }, { covered: 0, total: 0 }),
      ),
    ).toBe('empty');
  });
});
