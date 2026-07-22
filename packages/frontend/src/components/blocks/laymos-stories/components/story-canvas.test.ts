import { describe, expect, it } from 'vitest';
import type { StoryRun } from 'laymos/report';

import { primaryStory } from './story-canvas';

const location = { file: 'story.ts', line: 1, column: 1 };

const story = {
  schemaVersion: 4,
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

    expect(Object.keys(primary.blocks)).toEqual(['first', 'second']);
    expect(primary.scenarios[0]?.execution).toEqual([
      {
        parallel: [
          [expect.objectContaining({ blockId: 'first' })],
          [expect.objectContaining({ blockId: 'second' })],
        ],
      },
    ]);
  });
});
