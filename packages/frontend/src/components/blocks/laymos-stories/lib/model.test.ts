import { describe, expect, it } from 'vitest';
import type { StoryArm, StoryRun, StoryTrace } from 'laymos/report';

import {
  checkoutStory,
  happyScenarioIndex,
  storiesFixtureCatalog,
  storiesFixtureReport,
} from '../fixtures/reports';
import {
  buildProgressiveScenarioGraph,
  buildProgressiveStoryGraph,
  buildStoryCatalogTree,
  collapseStoryGraph,
  storyRunFromTrace,
} from './model';

describe('buildStoryCatalogTree', () => {
  it('organizes Groups before their direct Stories and preserves descendants', () => {
    const tree = buildStoryCatalogTree(
      storiesFixtureCatalog,
      storiesFixtureReport.stories,
    );

    expect(tree.groups.map(({ name }) => name)).toEqual([
      'Commerce',
      'Support',
    ]);
    expect(tree.groups[0]?.groups[0]).toMatchObject({
      name: 'Orders',
      descendantStoryIds: [
        'test/stories/checkout.story.ts',
        'test/stories/refund.story.ts',
      ],
    });
    expect(tree.standaloneStories).toEqual([]);
  });
});

describe('buildProgressiveStoryGraph', () => {
  it('folds visits by block identity and preserves observed decision arms', () => {
    const model = buildProgressiveStoryGraph(checkoutStory);
    const risk = model.nodes.find(
      (node) => node.kind === 'block' && node.blockId === 'risk',
    );

    expect(
      model.nodes.filter(
        (node) => node.kind === 'block' && node.blockId === 'checkout',
      ),
    ).toHaveLength(1);
    expect(risk?.kind).toBe('block');
    if (risk?.kind !== 'block') throw new Error('Risk block not found');
    expect(risk?.observedArms).toEqual([
      'literal:string:"accepted"',
      'literal:string:"rejected"',
    ]);
    expect(risk?.visit).toBeUndefined();
  });

  it('flattens containment into one execution flow', () => {
    const model = buildProgressiveStoryGraph(checkoutStory);

    expect(model.edges).toContainEqual(
      expect.objectContaining({
        source: 'inventory::arm:literal:string:"available"',
        target: 'reserve',
      }),
    );
    expect(model.edges).toContainEqual(
      expect.objectContaining({ source: 'reserve', target: 'payment' }),
    );
    expect(model.edges).toContainEqual(
      expect.objectContaining({ source: 'reserve', target: 'analytics' }),
    );
  });

  it('keeps a shared block separate under different direct callers', () => {
    const scenario = checkoutStory.scenarios[happyScenarioIndex]!;
    const contextualStory = {
      ...checkoutStory,
      blocks: {
        root: checkoutStory.blocks.checkout!,
        read: checkoutStory.blocks.inventory!,
        write: checkoutStory.blocks.payment!,
        request: checkoutStory.blocks.capture!,
      },
      scenarios: [
        {
          ...scenario,
          execution: [
            {
              blockId: 'root',
              outcome: 'succeeded',
              startOffsetMillis: 0,
              durationMillis: 10,
              children: [
                {
                  blockId: 'read',
                  outcome: 'succeeded',
                  startOffsetMillis: 1,
                  durationMillis: 3,
                  children: [
                    {
                      blockId: 'request',
                      outcome: 'succeeded',
                      startOffsetMillis: 2,
                      durationMillis: 1,
                      children: [],
                    },
                  ],
                },
                {
                  blockId: 'write',
                  outcome: 'succeeded',
                  startOffsetMillis: 5,
                  durationMillis: 3,
                  children: [
                    {
                      blockId: 'request',
                      outcome: 'succeeded',
                      startOffsetMillis: 6,
                      durationMillis: 1,
                      children: [],
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    } satisfies StoryRun;

    const model = buildProgressiveStoryGraph(contextualStory);

    expect(
      model.nodes
        .filter((node) => node.kind === 'block' && node.blockId === 'request')
        .map((node) => node.id),
    ).toEqual(['request@read', 'request@write']);
    expect(model.edges).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ source: 'read', target: 'request@read' }),
        expect.objectContaining({ source: 'request@read', target: 'write' }),
        expect.objectContaining({ source: 'write', target: 'request@write' }),
      ]),
    );
  });

  it('shows declared arms that no scenario covered as inactive', () => {
    const model = buildProgressiveStoryGraph(checkoutStory);

    expect(
      model.nodes.find(
        (node) =>
          node.kind === 'arm' &&
          node.id === 'inventory::arm:literal:string:"unavailable"',
      ),
    ).toMatchObject({ kind: 'arm', active: false });
    expect(model.edges).toContainEqual(
      expect.objectContaining({
        source: 'inventory',
        target: 'inventory::arm:literal:string:"unavailable"',
        inactive: true,
      }),
    );
  });

  it('drops folded edges that would turn repeated visits into cycles', () => {
    const scenario = checkoutStory.scenarios[happyScenarioIndex]!;
    const repeatedStory = {
      ...checkoutStory,
      blocks: {
        root: checkoutStory.blocks.checkout!,
        operation: checkoutStory.blocks.reserve!,
        request: checkoutStory.blocks.capture!,
      },
      scenarios: [
        {
          ...scenario,
          execution: [
            {
              blockId: 'root',
              outcome: 'succeeded',
              startOffsetMillis: 0,
              durationMillis: 10,
              children: [
                {
                  blockId: 'operation',
                  outcome: 'succeeded',
                  startOffsetMillis: 1,
                  durationMillis: 3,
                  children: [
                    {
                      blockId: 'request',
                      outcome: 'succeeded',
                      startOffsetMillis: 2,
                      durationMillis: 1,
                      children: [],
                    },
                  ],
                },
                {
                  blockId: 'operation',
                  outcome: 'succeeded',
                  startOffsetMillis: 5,
                  durationMillis: 3,
                  children: [
                    {
                      blockId: 'request',
                      outcome: 'succeeded',
                      startOffsetMillis: 6,
                      durationMillis: 1,
                      children: [],
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    } satisfies StoryRun;

    const model = buildProgressiveStoryGraph(repeatedStory);

    expect(model.edges).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ source: 'root', target: 'operation' }),
        expect.objectContaining({ source: 'operation', target: 'request' }),
      ]),
    );
    expect(model.edges).not.toContainEqual(
      expect.objectContaining({ source: 'request', target: 'operation' }),
    );
  });
});

describe('storyRunFromTrace', () => {
  const location = { file: 'story.ts', line: 1, column: 1 };
  const arms: readonly StoryArm[] = [
    {
      kind: 'literal',
      value: true,
      name: 'yes',
      description: 'The positive branch.',
    },
    {
      kind: 'otherwise',
      name: 'no',
      description: 'The negative branch.',
    },
  ];

  it('keeps sequential decision projection bounded while covering every arm', () => {
    const decisionCount = 20;
    const blocks = Object.fromEntries(
      Array.from({ length: decisionCount }, (_, index) => [
        `decision-${index}`,
        {
          kind: 'decision' as const,
          name: `Decision ${index}`,
          description: 'A binary decision.',
          location,
          arms,
        },
      ]),
    );
    const trace = {
      status: 'valid',
      generatedAt: 0,
      blocks,
      execution: Array.from({ length: decisionCount }, (_, index) => ({
        kind: 'decision' as const,
        blockId: `decision-${index}`,
        selector: [],
        arms: arms.map((arm) => ({ arm, children: [] })),
      })),
      definitions: {},
    } satisfies StoryTrace;

    const story = storyRunFromTrace(trace, 'Decisions', 'Many decisions');
    const model = buildProgressiveStoryGraph(story);

    expect(story.scenarios).toHaveLength(2);
    expect(model.nodes.filter((node) => node.kind === 'block')).toHaveLength(
      decisionCount,
    );
    expect(model.nodes.filter((node) => node.kind === 'arm')).toHaveLength(
      decisionCount * arms.length,
    );
    expect(
      model.nodes
        .filter((node) => node.kind === 'arm')
        .every((node) => node.active),
    ).toBe(true);
    for (let index = 0; index < decisionCount - 1; index += 1) {
      for (const arm of arms) {
        expect(model.edges).toContainEqual(
          expect.objectContaining({
            source: `decision-${index}::arm:${
              arm.kind === 'otherwise' ? 'otherwise' : 'literal:boolean:true'
            }`,
            target: `decision-${index + 1}`,
          }),
        );
      }
    }
  });

  it('preserves concurrent branches without multiplying their alternatives', () => {
    const decisionBlock = (name: string) => ({
      kind: 'decision' as const,
      name,
      description: 'A binary decision.',
      location,
      arms,
    });
    const trace = {
      status: 'valid',
      generatedAt: 0,
      blocks: {
        start: { kind: 'step', name: 'Start', description: '', location },
        left: decisionBlock('Left'),
        right: decisionBlock('Right'),
        finish: { kind: 'step', name: 'Finish', description: '', location },
      },
      execution: [
        { kind: 'step', blockId: 'start' },
        {
          kind: 'all',
          options: { concurrency: 'unbounded' },
          branches: ['left', 'right'].map((blockId) => [
            {
              kind: 'decision' as const,
              blockId,
              selector: [],
              arms: arms.map((arm) => ({ arm, children: [] })),
            },
          ]),
        },
        { kind: 'step', blockId: 'finish' },
      ],
      definitions: {},
    } satisfies StoryTrace;

    const story = storyRunFromTrace(trace, 'Parallel', 'Parallel decisions');
    const model = buildProgressiveStoryGraph(story);

    expect(story.scenarios).toHaveLength(2);
    expect(story.scenarios[0]?.execution[1]).toHaveProperty('parallel');
    expect(model.edges).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ source: 'start', target: 'left' }),
        expect.objectContaining({ source: 'start', target: 'right' }),
        expect.objectContaining({
          source: 'left::arm:literal:boolean:true',
          target: 'finish',
        }),
        expect.objectContaining({
          source: 'left::arm:otherwise',
          target: 'finish',
        }),
        expect.objectContaining({
          source: 'right::arm:literal:boolean:true',
          target: 'finish',
        }),
        expect.objectContaining({
          source: 'right::arm:otherwise',
          target: 'finish',
        }),
      ]),
    );
  });
});

describe('buildProgressiveScenarioGraph', () => {
  it('marks a failed visit as expected when its scenario succeeds', () => {
    const failedScenario = checkoutStory.scenarios[2]!;
    const scenario = { ...failedScenario, outcome: 'succeeded' as const };
    const model = buildProgressiveScenarioGraph(checkoutStory, scenario);

    expect(model.nodes.find((node) => node.id === '0.2')).toMatchObject({
      kind: 'block',
      expectedFailure: true,
      visit: { outcome: 'failed' },
    });
  });

  it('keeps failed visits as errors when their scenario fails', () => {
    const scenario = checkoutStory.scenarios[2]!;
    const model = buildProgressiveScenarioGraph(checkoutStory, scenario);
    const payment = model.nodes.find((node) => node.id === '0.2');

    expect(payment).toMatchObject({
      kind: 'block',
      visit: { outcome: 'failed' },
    });
    expect(payment).not.toHaveProperty('expectedFailure');
  });

  it('keeps every visit under its structural address', () => {
    const scenario = checkoutStory.scenarios[happyScenarioIndex]!;
    const model = buildProgressiveScenarioGraph(checkoutStory, scenario);

    expect(model.nodes.filter((node) => node.kind === 'block')).toHaveLength(8);
    expect(model.nodes.find((node) => node.id === '0')).toMatchObject({
      kind: 'block',
      blockId: 'checkout',
    });
    expect(model.nodes.find((node) => node.id === '0.2.0.0')).toMatchObject({
      kind: 'block',
      blockId: 'payment',
    });
    expect(model.nodes.find((node) => node.id === '0.2.1.0')).toMatchObject({
      kind: 'block',
      blockId: 'analytics',
    });
  });

  it('fans sequential flow into and out of parallel branches', () => {
    const scenario = checkoutStory.scenarios[happyScenarioIndex]!;
    const model = buildProgressiveScenarioGraph(checkoutStory, scenario);

    expect(model.edges).toContainEqual(
      expect.objectContaining({
        source: '0.1.0',
        target: '0.2.0.0',
      }),
    );
    expect(model.edges).toContainEqual(
      expect.objectContaining({ source: '0.1.0', target: '0.2.1.0' }),
    );
    expect(model.edges).toContainEqual(
      expect.objectContaining({ source: '0.2.0.0.0', target: '0.3' }),
    );
    expect(model.edges).toContainEqual(
      expect.objectContaining({ source: '0.2.1.0', target: '0.3' }),
    );
  });

  it('retains direct children for hover disclosure', () => {
    const scenario = checkoutStory.scenarios[happyScenarioIndex]!;
    const model = buildProgressiveScenarioGraph(checkoutStory, scenario);

    expect(model.childrenByNode['0']).toEqual([
      '0.0',
      '0.1',
      '0.2.0.0',
      '0.2.1.0',
      '0.3',
    ]);
    expect(model.childrenByNode['0.1']).toEqual(['0.1.0']);
    expect(model.childrenByNode['0.2.0.0']).toEqual(['0.2.0.0.0']);
  });

  it('renders every declared arm and disables arms unused by the scenario', () => {
    const scenario = checkoutStory.scenarios[happyScenarioIndex]!;
    const model = buildProgressiveScenarioGraph(checkoutStory, scenario);
    const paymentArms = model.nodes.filter(
      (node) => node.kind === 'arm' && node.decisionId === '0.2.0.0',
    );

    expect(paymentArms).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          arm: expect.objectContaining({ name: 'approved' }),
          active: true,
        }),
        expect.objectContaining({
          arm: expect.objectContaining({ name: 'declined' }),
          active: false,
        }),
      ]),
    );
    expect(model.edges).toContainEqual(
      expect.objectContaining({
        source: '0.2.0.0',
        target: '0.2.0.0::arm:literal:string:"declined"',
        inactive: true,
      }),
    );
  });

  it('collapses every downstream visual node and reports the hidden count', () => {
    const scenario = checkoutStory.scenarios[happyScenarioIndex]!;
    const model = buildProgressiveScenarioGraph(checkoutStory, scenario);
    const collapsed = collapseStoryGraph(model, new Set(['0.2.0.0']));

    expect(collapsed.hiddenCountByNode.get('0.2.0.0')).toBe(3);
    expect(collapsed.model.nodes.map((node) => node.id)).not.toEqual(
      expect.arrayContaining([
        '0.2.0.0::arm:literal:string:"approved"',
        '0.2.0.0::arm:literal:string:"declined"',
        '0.2.0.0.0',
      ]),
    );
    expect(collapsed.model.nodes.map((node) => node.id)).toContain('0.3');
    expect(collapsed.model.edges).toContainEqual(
      expect.objectContaining({
        source: '0.2.0.0',
        target: '0.3',
        summary: true,
      }),
    );
    expect(
      collapsed.model.edges.every(
        (edge) =>
          collapsed.model.nodes.some((node) => node.id === edge.source) &&
          collapsed.model.nodes.some((node) => node.id === edge.target),
      ),
    ).toBe(true);
  });
});
