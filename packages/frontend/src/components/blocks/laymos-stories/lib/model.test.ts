import { describe, expect, it } from 'vitest';
import type {
  StoryArm,
  StoryCatalog,
  StoryRun,
  StoryTrace,
} from 'laymos/report';

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
  buildStoryExecutionCoverage,
  collapseStoryGraph,
  compactValueDecisions,
  inlineTraceDefinitions,
  storyRunFromTrace,
  storyNodeExecutionCoverage,
  withoutFlowNodes,
} from './model';
import { layoutStoryGraph } from './layout';

describe('inlineTraceDefinitions', () => {
  it('opens shared Flows in place and keeps recursive references finite', () => {
    const trace = {
      status: 'valid',
      generatedAt: 0,
      blocks: {},
      execution: [{ kind: 'flow-reference', blockId: 'replace' }],
      definitions: {
        replace: [
          { kind: 'step', blockId: 'find' },
          { kind: 'flow-reference', blockId: 'replace' },
        ],
      },
    } satisfies StoryTrace;

    expect(inlineTraceDefinitions(trace).execution).toEqual([
      {
        kind: 'flow',
        blockId: 'replace',
        children: [
          { kind: 'step', blockId: 'find' },
          { kind: 'flow-reference', blockId: 'replace' },
        ],
      },
    ]);
  });
});

const nestedFlowStory = {
  generatedAt: 0,
  name: 'Nested calls',
  description: 'Separates each Flow into its own graph.',
  blocks: {
    rootFlow: {
      kind: 'flow',
      name: 'Root flow',
      description: 'Coordinates the operation.',
      location: { file: 'story.ts', line: 1, column: 1 },
      visibility: 'primary',
    },
    first: {
      kind: 'step',
      name: 'First step',
      description: '',
      location: { file: 'story.ts', line: 2, column: 1 },
      visibility: 'primary',
    },
    nestedFlow: {
      kind: 'flow',
      name: 'Nested flow',
      description: 'Performs nested work.',
      location: { file: 'story.ts', line: 3, column: 1 },
      visibility: 'primary',
    },
    inside: {
      kind: 'step',
      name: 'Inside nested flow',
      description: '',
      location: { file: 'story.ts', line: 4, column: 1 },
      visibility: 'primary',
    },
    after: {
      kind: 'step',
      name: 'After nested flow',
      description: '',
      location: { file: 'story.ts', line: 5, column: 1 },
      visibility: 'primary',
    },
  },
  scenarios: [
    {
      name: 'Nested scenario',
      description: '',
      location: { file: 'story.ts', line: 6, column: 1 },
      outcome: 'succeeded',
      failures: [],
      execution: [
        {
          blockId: 'rootFlow',
          outcome: 'succeeded',
          startOffsetMillis: 0,
          durationMillis: 5,
          children: [
            {
              blockId: 'first',
              outcome: 'succeeded',
              startOffsetMillis: 1,
              durationMillis: 1,
              children: [],
            },
            {
              blockId: 'nestedFlow',
              outcome: 'succeeded',
              startOffsetMillis: 2,
              durationMillis: 2,
              children: [
                {
                  blockId: 'inside',
                  outcome: 'succeeded',
                  startOffsetMillis: 2,
                  durationMillis: 1,
                  children: [],
                },
              ],
            },
            {
              blockId: 'after',
              outcome: 'succeeded',
              startOffsetMillis: 4,
              durationMillis: 1,
              children: [],
            },
          ],
        },
      ],
    },
  ],
} satisfies StoryRun;

describe('inline Flow scopes', () => {
  it('inlines every Flow in Story and Scenario graphs', () => {
    const storyModel = buildProgressiveStoryGraph(nestedFlowStory);
    const scenario = nestedFlowStory.scenarios[0]!;
    const scenarioModel = buildProgressiveScenarioGraph(
      nestedFlowStory,
      scenario,
    );

    expect(storyModel.nodes.map((node) => node.id)).toEqual([
      'rootFlow',
      'first',
      'nestedFlow',
      'inside',
      'after',
    ]);
    expect(storyModel.childrenByNode).toMatchObject({
      rootFlow: ['first', 'nestedFlow', 'after'],
      nestedFlow: ['inside'],
    });
    expect(storyModel.nodes.find(({ id }) => id === 'first')).toMatchObject({
      startsFlows: [{ id: 'rootFlow', name: 'Root flow' }],
    });
    expect(storyModel.nodes.find(({ id }) => id === 'inside')).toMatchObject({
      startsFlows: [{ id: 'nestedFlow', name: 'Nested flow' }],
    });
    expect(storyModel.edges).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ source: 'first', target: 'inside' }),
        expect.objectContaining({ source: 'inside', target: 'after' }),
      ]),
    );
    expect(
      storyModel.edges.some(
        ({ source, target }) =>
          source === 'rootFlow' ||
          target === 'rootFlow' ||
          source === 'nestedFlow' ||
          target === 'nestedFlow',
      ),
    ).toBe(false);
    expect(scenarioModel.nodes.map((node) => node.id)).toEqual([
      '0',
      '0.0',
      '0.1',
      '0.1.0',
      '0.2',
    ]);
  });

  it('keeps operations above useful Flow backgrounds and omits one-node scopes', () => {
    const model = buildProgressiveStoryGraph(nestedFlowStory);
    const layout = layoutStoryGraph(model, {
      compact: true,
    });
    expect(layout.nodes.find(({ id }) => id === 'rootFlow')).toMatchObject({
      data: { inline: true, scopeDepth: 0 },
      zIndex: -100,
    });
    expect(layout.nodes.find(({ id }) => id === 'nestedFlow')).toBeUndefined();
    expect(
      layout.nodes
        .filter(({ id }) => id === 'first' || id === 'inside' || id === 'after')
        .every(({ zIndex }) => (zIndex ?? 0) > -100),
    ).toBe(true);
    expect(
      layout.edges.some(
        ({ source, target }) =>
          source === 'nestedFlow' || target === 'nestedFlow',
      ),
    ).toBe(false);
  });

  it('removes Flow wrappers when their entry node is collapsed', () => {
    const model = buildProgressiveStoryGraph(nestedFlowStory);
    const collapsed = collapseStoryGraph(model, new Set(['first']));
    const layout = layoutStoryGraph(collapsed.model, { compact: true });

    expect(collapsed.hiddenCountByNode.get('first')).toBe(2);
    expect(layout.nodes.find(({ id }) => id === 'inside')).toBeUndefined();
    expect(layout.nodes.find(({ id }) => id === 'rootFlow')).toBeUndefined();
    expect(layout.nodes.find(({ id }) => id === 'nestedFlow')).toBeUndefined();
    expect(layout.nodes.map(({ id }) => id)).toEqual(['first']);
  });

  it('can remove every Flow wrapper for a control-flow-only view', () => {
    const model = withoutFlowNodes(buildProgressiveStoryGraph(nestedFlowStory));

    expect(model.nodes.map(({ id }) => id)).toEqual([
      'first',
      'inside',
      'after',
    ]);
    expect(model.nodes).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ startsFlows: expect.anything() }),
      ]),
    );
    expect(model.edges).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ source: 'first', target: 'inside' }),
        expect.objectContaining({ source: 'inside', target: 'after' }),
      ]),
    );

    const source = buildProgressiveStoryGraph(nestedFlowStory);
    const atomicCall = withoutFlowNodes({
      nodes: source.nodes.filter(({ id }) =>
        ['first', 'nestedFlow', 'after'].includes(id),
      ),
      edges: [
        {
          id: 'first->nestedFlow',
          source: 'first',
          target: 'nestedFlow',
          inactive: false,
        },
        {
          id: 'nestedFlow->after',
          source: 'nestedFlow',
          target: 'after',
          inactive: false,
        },
      ],
      childrenByNode: {},
    });
    expect(atomicCall.edges).toEqual([
      expect.objectContaining({ source: 'first', target: 'after' }),
    ]);
  });
});

describe('compact value Decisions', () => {
  it('renders one Decision node and keeps a shared active continuation', () => {
    const location = { file: 'story.ts', line: 1, column: 1 };
    const model = {
      nodes: [
        {
          kind: 'block',
          id: 'choice',
          blockId: 'choice',
          block: {
            kind: 'decision',
            role: 'value',
            name: 'Choose value',
            description: 'Calculates one value.',
            location,
            arms: [],
          },
        },
        {
          kind: 'arm',
          id: 'active-arm',
          decisionId: 'choice',
          arm: {
            kind: 'literal',
            value: true,
            name: 'Active',
            description: 'Uses the active value.',
            location,
          },
          active: true,
        },
        {
          kind: 'arm',
          id: 'inactive-arm',
          decisionId: 'choice',
          arm: {
            kind: 'otherwise',
            name: 'Inactive',
            description: 'Uses the other value.',
            location,
          },
          active: false,
        },
        {
          kind: 'block',
          id: 'next',
          blockId: 'next',
          block: {
            kind: 'step',
            name: 'Continue',
            description: 'Uses the selected value.',
            location,
          },
        },
      ],
      edges: [
        {
          id: 'choice->active-arm',
          source: 'choice',
          target: 'active-arm',
          inactive: false,
        },
        {
          id: 'choice->inactive-arm',
          source: 'choice',
          target: 'inactive-arm',
          inactive: true,
        },
        {
          id: 'active-arm->next',
          source: 'active-arm',
          target: 'next',
          inactive: false,
        },
        {
          id: 'inactive-arm->next',
          source: 'inactive-arm',
          target: 'next',
          inactive: true,
        },
      ],
      childrenByNode: {},
    } as const;

    const compact = compactValueDecisions(model);

    expect(compact.nodes.map(({ id }) => id)).toEqual(['choice', 'next']);
    expect(compact.edges).toEqual([
      {
        id: 'choice->next',
        source: 'choice',
        target: 'next',
        inactive: false,
      },
    ]);
  });
});

describe('buildStoryCatalogTree', () => {
  it('lists owning Modules and sorts Stories without requiring unique names', () => {
    const catalog = {
      modules: [
        {
          modulePath: 'src/zeta',
          description: 'The later Module.',
          stories: [
            {
              storyPath: 'src/zeta/laymos/second',
              storyKey: 'second',
              modulePath: 'src/zeta',
              name: 'Shared name',
              description: 'Second Story.',
            },
            {
              storyPath: 'src/zeta/laymos/first',
              storyKey: 'first',
              modulePath: 'src/zeta',
              name: 'Shared name',
              description: 'First Story.',
            },
          ],
        },
        {
          modulePath: 'src/alpha',
          description: 'The earlier Module.',
          stories: [
            {
              storyPath: 'src/alpha/laymos/only',
              storyKey: 'only',
              modulePath: 'src/alpha',
              name: 'Only Story',
              description: 'Only Story.',
            },
          ],
        },
      ],
    } satisfies StoryCatalog;

    const tree = buildStoryCatalogTree(catalog, {});

    expect(tree.modules.map(({ modulePath }) => modulePath)).toEqual([
      'src/alpha',
      'src/zeta',
    ]);
    expect(tree.modules[1]?.stories.map(({ storyPath }) => storyPath)).toEqual([
      'src/zeta/laymos/first',
      'src/zeta/laymos/second',
    ]);
  });

  it('connects each Module to its owned Stories', () => {
    const tree = buildStoryCatalogTree(
      storiesFixtureCatalog,
      storiesFixtureReport.stories,
    );

    expect(tree.modules.map(({ modulePath }) => modulePath)).toEqual([
      'src/orders',
      'src/support',
    ]);
    expect(tree.modules[0]).toMatchObject({
      modulePath: 'src/orders',
      stories: [
        { storyPath: 'src/orders/laymos/checkout' },
        { storyPath: 'src/orders/laymos/refund' },
      ],
    });
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

describe('buildStoryExecutionCoverage', () => {
  const location = { file: 'story.ts', line: 1, column: 1 };
  const yes = {
    kind: 'literal' as const,
    value: true,
    name: 'yes',
    description: 'Takes the positive route.',
  };
  const no = {
    kind: 'otherwise' as const,
    name: 'no',
    description: 'Takes the fallback route.',
  };
  const blocks = {
    root: {
      kind: 'flow' as const,
      name: 'Root',
      description: 'Runs the operation.',
      location,
    },
    read: {
      kind: 'step' as const,
      name: 'Read',
      description: 'Reads state.',
      location,
    },
    write: {
      kind: 'step' as const,
      name: 'Write',
      description: 'Writes state.',
      location,
    },
    request: {
      kind: 'step' as const,
      name: 'Request',
      description: 'Sends a request.',
      location,
    },
    route: {
      kind: 'decision' as const,
      name: 'Route',
      description: 'Selects a route.',
      location,
      arms: [yes, no],
    },
  };
  const visit = (
    blockId: keyof typeof blocks,
    children: StoryRun['scenarios'][number]['execution'] = [],
    selectedArm?:
      | { readonly kind: 'literal'; readonly value: true }
      | {
          readonly kind: 'otherwise';
        },
  ) => ({
    blockId,
    outcome: 'succeeded' as const,
    startOffsetMillis: 0,
    durationMillis: 1,
    ...(selectedArm ? { selectedArm } : {}),
    children,
  });
  const scenario = (
    name: string,
    execution: StoryRun['scenarios'][number]['execution'],
    outcome: StoryRun['scenarios'][number]['outcome'] = 'succeeded',
  ) => ({
    name,
    description: name,
    location,
    outcome,
    execution,
    failures: [],
  });
  const readPath = [
    visit('root', [
      visit('read', [visit('request')]),
      visit('route', [], { kind: 'literal', value: true }),
    ]),
  ];
  const writePath = [
    visit('root', [
      visit('write', [visit('request')]),
      visit('route', [], { kind: 'otherwise' }),
    ]),
  ];
  const canonical = {
    generatedAt: 0,
    name: 'Contextual coverage',
    description: 'Covers contextual nodes.',
    blocks,
    scenarios: [
      scenario('Read route', readPath),
      scenario('Write route', writePath),
    ],
  } satisfies StoryRun;

  it('keeps reused Blocks contextual and counts selected Arms from failed runs', () => {
    const run = {
      ...canonical,
      scenarios: [
        scenario('Read route', readPath, 'failed'),
        scenario('Skipped write route', writePath, 'skipped'),
      ],
    } satisfies StoryRun;

    const coverage = buildStoryExecutionCoverage(canonical, run);

    expect(coverage.blocks).toEqual({ covered: 4, total: 6 });
    expect(coverage.arms).toEqual({ covered: 1, total: 2 });
    expect(coverage.coveredNodeIds).toContain('request@read');
    expect(coverage.coveredNodeIds).not.toContain('request@write');
    expect(coverage.coveredNodeIds).toContain(
      'route::arm:literal:boolean:true',
    );
    expect(coverage.coveredNodeIds).not.toContain('route::arm:otherwise');
    expect(coverage.observedEdgeIds).toContain('read->request@read');
    expect(coverage.observedEdgeIds).not.toContain('write->request@write');
  });

  it('rolls hidden Block and Arm gaps into a partial collapsed node', () => {
    const coverage = buildStoryExecutionCoverage(canonical, {
      ...canonical,
      scenarios: [scenario('Read route', readPath)],
    });
    const collapsed = collapseStoryGraph(
      buildProgressiveStoryGraph(canonical),
      new Set(['root']),
    );

    expect(
      storyNodeExecutionCoverage(
        coverage,
        'root',
        collapsed.hiddenNodeIdsByNode.get('root'),
      ),
    ).toEqual({
      status: 'partial',
      hiddenUncoveredBlocks: 2,
      hiddenUncoveredArms: 1,
    });
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

  it('closes a Terminal Decision Arm without closing its siblings', () => {
    const trace = {
      status: 'valid',
      generatedAt: 0,
      blocks: {
        choice: {
          kind: 'decision',
          name: 'Choice',
          description: 'Chooses whether to stop.',
          location,
          arms,
        },
        stop: {
          kind: 'terminal',
          name: 'Stop',
          description: 'Ends this Arm.',
          location,
          completion: { kind: 'error', error: 'Stopped' },
        },
        proceed: {
          kind: 'step',
          name: 'Proceed',
          description: 'Keeps this Arm open.',
          location,
        },
        finish: {
          kind: 'step',
          name: 'Finish',
          description: 'Shared continuation.',
          location,
        },
      },
      execution: [
        {
          kind: 'decision',
          blockId: 'choice',
          selector: [],
          arms: [
            {
              arm: arms[0]!,
              children: [{ kind: 'terminal', blockId: 'stop' }],
            },
            { arm: arms[1]!, children: [{ kind: 'step', blockId: 'proceed' }] },
          ],
        },
        { kind: 'step', blockId: 'finish' },
      ],
      definitions: {},
    } satisfies StoryTrace;

    const model = buildProgressiveStoryGraph(
      storyRunFromTrace(trace, 'Terminal choice', 'Terminal choice'),
    );

    expect(model.edges).not.toContainEqual(
      expect.objectContaining({ source: 'stop', target: 'finish' }),
    );
    expect(model.edges).toContainEqual(
      expect.objectContaining({ source: 'proceed', target: 'finish' }),
    );
  });

  it('keeps Flow callers and parallel siblings open after local Terminals', () => {
    const trace = {
      status: 'valid',
      generatedAt: 0,
      blocks: {
        nested: {
          kind: 'flow',
          name: 'Nested',
          description: 'Owns one Terminal.',
          location,
        },
        nestedEnd: {
          kind: 'terminal',
          name: 'Nested end',
          description: 'Ends the nested Flow.',
          location,
          completion: { kind: 'success' },
        },
        parallelEnd: {
          kind: 'terminal',
          name: 'Parallel end',
          description: 'Ends one parallel branch.',
          location,
        },
        afterNested: {
          kind: 'step',
          name: 'After nested',
          description: 'Continues after the nested Flow.',
          location,
        },
        sibling: {
          kind: 'step',
          name: 'Sibling',
          description: 'Keeps its parallel branch open.',
          location,
        },
        finish: {
          kind: 'step',
          name: 'Finish',
          description: 'Continues the outer branch.',
          location,
        },
      },
      execution: [
        {
          kind: 'flow',
          blockId: 'nested',
          children: [{ kind: 'terminal', blockId: 'nestedEnd' }],
        },
        { kind: 'step', blockId: 'afterNested' },
        {
          kind: 'all',
          options: { concurrency: 'unbounded' },
          branches: [
            [{ kind: 'terminal', blockId: 'parallelEnd' }],
            [{ kind: 'step', blockId: 'sibling' }],
          ],
        },
        { kind: 'step', blockId: 'finish' },
      ],
      definitions: {},
    } satisfies StoryTrace;

    const model = buildProgressiveStoryGraph(
      storyRunFromTrace(trace, 'Local Terminals', 'Local Terminals'),
    );

    expect(model.edges).toContainEqual(
      expect.objectContaining({ source: 'nestedEnd', target: 'afterNested' }),
    );
    expect(model.edges).toContainEqual(
      expect.objectContaining({ source: 'sibling', target: 'finish' }),
    );
    expect(model.edges).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ source: 'nestedEnd', target: 'finish' }),
        expect.objectContaining({ source: 'parallelEnd', target: 'finish' }),
      ]),
    );
  });

  it('does not continue a Flow caller after an error Terminal', () => {
    const trace = {
      status: 'valid',
      generatedAt: 0,
      blocks: {
        nested: {
          kind: 'flow',
          name: 'Nested',
          description: 'Owns one error Terminal.',
          location,
        },
        nestedError: {
          kind: 'terminal',
          name: 'Nested error',
          description: 'Fails the nested Flow.',
          location,
          completion: { kind: 'error', error: 'InvalidShape' },
        },
        afterNested: {
          kind: 'step',
          name: 'After nested',
          description: 'Must not follow the failed Flow.',
          location,
        },
      },
      execution: [
        {
          kind: 'flow',
          blockId: 'nested',
          children: [{ kind: 'terminal', blockId: 'nestedError' }],
        },
        { kind: 'step', blockId: 'afterNested' },
      ],
      definitions: {},
    } satisfies StoryTrace;

    const model = buildProgressiveStoryGraph(
      storyRunFromTrace(trace, 'Failed nested Flow', 'Failed nested Flow'),
    );

    expect(model.edges).not.toContainEqual(
      expect.objectContaining({
        source: 'nestedError',
        target: 'afterNested',
      }),
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
