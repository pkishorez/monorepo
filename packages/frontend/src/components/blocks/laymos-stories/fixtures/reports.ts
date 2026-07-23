import type {
  ExecutionItem,
  ProjectNarrative,
  StoriesRun,
  StoryCatalog,
  ScenarioOutcome,
  StoryArm,
  StoryRun,
  StoryBlock,
  StoryBlockVisitOutcome,
  StoryScenario,
  StorySelectedArm,
  StorySourceLocation,
} from 'laymos/report';

const location = (file: string, line: number, column = 1) => ({
  file,
  line,
  column,
});

const generatedAt = 1_784_620_800_000;

interface DraftVisit {
  readonly blockId: string;
  readonly outcome: StoryBlockVisitOutcome;
  readonly selectedArm?: StorySelectedArm;
  readonly attributes?: Readonly<Record<string, unknown>>;
  readonly children: readonly DraftItem[];
}

type DraftItem =
  | DraftVisit
  | { readonly parallel: readonly (readonly DraftItem[])[] };

interface DraftScenario {
  readonly name: string;
  readonly description: string;
  readonly location: StorySourceLocation;
  readonly outcome: ScenarioOutcome;
  readonly execution: readonly DraftItem[];
  readonly failures?: StoryScenario['failures'];
}

interface DraftArtifact {
  readonly name: string;
  readonly description: string;
  readonly blocks: Readonly<Record<string, StoryBlock>>;
  readonly scenarios: readonly DraftScenario[];
}

function timeItems(
  items: readonly DraftItem[],
  start: number,
): [ExecutionItem[], number] {
  let clock = start;
  const timed: ExecutionItem[] = [];
  for (const item of items) {
    if ('parallel' in item) {
      let end = clock;
      const branches = item.parallel.map((branch) => {
        const [visits, branchEnd] = timeItems(branch, clock);
        end = Math.max(end, branchEnd);
        return visits;
      });
      timed.push({ parallel: branches });
      clock = end;
    } else {
      const [children, childrenEnd] = timeItems(item.children, clock + 2);
      const end = Math.max(childrenEnd, clock + 8) + 2;
      timed.push({
        ...item,
        startOffsetMillis: clock,
        durationMillis: end - clock,
        children,
      });
      clock = end;
    }
  }
  return [timed, clock];
}

const finalizeScenario = (
  draft: DraftScenario,
  index: number,
): StoryScenario => {
  if (draft.outcome === 'skipped') {
    return { ...draft, execution: [], failures: draft.failures ?? [] };
  }
  const [execution, end] = timeItems(draft.execution, 0);
  return {
    ...draft,
    startedAt: generatedAt - 60_000 + index * 5_000,
    durationMillis: end,
    execution,
    failures: draft.failures ?? [],
  };
};

const artifact = (draft: DraftArtifact): StoryRun => ({
  generatedAt,
  name: draft.name,
  description: draft.description,
  blocks: draft.blocks,
  scenarios: draft.scenarios.map(finalizeScenario),
});

const literalArms = (...values: readonly string[]): StoryArm[] =>
  values.map((value) => ({
    kind: 'literal',
    value,
    name: value,
    description: `Continues through the ${value} outcome.`,
  }));

const selected = (value: string): StorySelectedArm => ({
  kind: 'literal',
  value,
});

const blocks = {
  checkout: {
    kind: 'step',
    name: 'Place checkout order',
    description:
      'Coordinates validation, reservation, payment, and completion.',
    location: location('src/checkout/place-order.ts', 18, 22),
  },
  inventory: {
    kind: 'decision',
    name: 'Check inventory',
    description: 'Determines whether every requested item can be reserved.',
    location: location('src/inventory/check-inventory.ts', 31, 10),
    arms: literalArms('available', 'unavailable'),
  },
  reserve: {
    kind: 'step',
    name: 'Reserve inventory',
    description: 'Holds the requested stock for this checkout.',
    location: location('src/inventory/reserve.ts', 14, 5),
  },
  payment: {
    kind: 'decision',
    name: 'Authorize payment',
    description:
      'Routes the order according to the payment authorization result.',
    location: location('src/payments/authorize.ts', 44, 12),
    arms: literalArms('approved', 'declined'),
  },
  capture: {
    kind: 'step',
    name: 'Capture payment',
    description: 'Captures the authorized amount from the customer.',
    location: location('src/payments/capture.ts', 20, 7),
  },
  risk: {
    kind: 'decision',
    name: 'Evaluate risk',
    description: 'Decides whether checkout may continue for this customer.',
    location: location('src/risk/evaluate.ts', 25, 14),
    arms: literalArms('accepted', 'rejected'),
  },
  reject: {
    kind: 'step',
    name: 'Reject checkout',
    description: 'Stops checkout and records the customer-facing reason.',
    location: location('src/checkout/reject.ts', 11, 3),
  },
  analytics: {
    kind: 'step',
    name: 'Record checkout analytics',
    description: 'Records product analytics independently of payment capture.',
    location: location('src/analytics/checkout.ts', 9, 4),
  },
  complete: {
    kind: 'step',
    name: 'Complete order',
    description: 'Persists the completed order and publishes confirmation.',
    location: location('src/checkout/complete.ts', 37, 6),
  },
} satisfies Readonly<Record<string, StoryBlock>>;

export const checkoutStoryId = 'src/orders/laymos/checkout';
export const happyScenarioIndex = 0;
export const fraudScenarioIndex = 1;
export const failedScenarioIndex = 2;

export const checkoutStory = artifact({
  name: 'Checkout',
  description: 'Places an order after inventory, risk, and payment approval.',
  blocks,
  scenarios: [
    {
      name: 'Happy path',
      description:
        'Completes an eligible order while recording analytics in parallel.',
      location: location(checkoutStoryId, 12, 3),
      outcome: 'succeeded',
      execution: [
        {
          blockId: 'checkout',
          outcome: 'succeeded',
          attributes: { orderId: 'order-42' },
          children: [
            {
              blockId: 'risk',
              outcome: 'succeeded',
              selectedArm: selected('accepted'),
              children: [],
            },
            {
              blockId: 'inventory',
              outcome: 'succeeded',
              selectedArm: selected('available'),
              children: [
                {
                  blockId: 'reserve',
                  outcome: 'succeeded',
                  attributes: { items: 3 },
                  children: [],
                },
              ],
            },
            {
              parallel: [
                [
                  {
                    blockId: 'payment',
                    outcome: 'succeeded',
                    selectedArm: selected('approved'),
                    children: [
                      {
                        blockId: 'capture',
                        outcome: 'succeeded',
                        attributes: { amount: 129.5, currency: 'USD' },
                        children: [],
                      },
                    ],
                  },
                ],
                [{ blockId: 'analytics', outcome: 'succeeded', children: [] }],
              ],
            },
            { blockId: 'complete', outcome: 'succeeded', children: [] },
          ],
        },
      ],
    },
    {
      name: 'Fraud rejected',
      description:
        'Rejects a high-risk checkout before inventory or payment work.',
      location: location(checkoutStoryId, 35, 3),
      outcome: 'succeeded',
      execution: [
        {
          blockId: 'checkout',
          outcome: 'succeeded',
          attributes: { orderId: 'order-91' },
          children: [
            {
              blockId: 'risk',
              outcome: 'succeeded',
              selectedArm: selected('rejected'),
              children: [
                {
                  blockId: 'reject',
                  outcome: 'succeeded',
                  attributes: { reason: 'risk-score' },
                  children: [],
                },
              ],
            },
          ],
        },
      ],
    },
    {
      name: 'Payment declined',
      description: 'Preserves the partial narrative when authorization fails.',
      location: location(checkoutStoryId, 53, 3),
      outcome: 'failed',
      execution: [
        {
          blockId: 'checkout',
          outcome: 'failed',
          attributes: { orderId: 'order-77' },
          children: [
            {
              blockId: 'risk',
              outcome: 'succeeded',
              selectedArm: selected('accepted'),
              children: [],
            },
            {
              blockId: 'inventory',
              outcome: 'succeeded',
              selectedArm: selected('available'),
              children: [
                { blockId: 'reserve', outcome: 'succeeded', children: [] },
              ],
            },
            {
              blockId: 'payment',
              outcome: 'failed',
              selectedArm: selected('declined'),
              attributes: { providerCode: 'do-not-honor' },
              children: [],
            },
          ],
        },
      ],
    },
    {
      name: 'Inventory unavailable',
      description: 'Documents the unavailable inventory case when enabled.',
      location: location(checkoutStoryId, 70, 3),
      outcome: 'skipped',
      execution: [],
    },
  ],
});

const refundStoryId = 'src/orders/laymos/refund';

const refundStory = artifact({
  name: 'Refund',
  description: 'Returns captured funds for an eligible completed order.',
  blocks: {
    refund: {
      kind: 'step',
      name: 'Refund order',
      description: 'Coordinates refund eligibility and payment reversal.',
      location: location('src/refunds/refund-order.ts', 16, 8),
    },
    eligibility: {
      kind: 'decision',
      name: 'Check refund window',
      description: 'Determines whether the order remains eligible for refund.',
      location: location('src/refunds/eligibility.ts', 22, 5),
      arms: literalArms('eligible', 'expired'),
    },
  },
  scenarios: [
    {
      name: 'Within refund window',
      description: 'Accepts a refund requested within the configured window.',
      location: location(refundStoryId, 10, 3),
      outcome: 'succeeded',
      execution: [
        {
          blockId: 'refund',
          outcome: 'succeeded',
          children: [
            {
              blockId: 'eligibility',
              outcome: 'succeeded',
              selectedArm: selected('eligible'),
              children: [],
            },
          ],
        },
      ],
    },
  ],
});

export const triageStoryId = 'src/support/laymos/triage';

const TREE_DEPTH = 5;
const triageBlocks: Record<string, StoryBlock> = {};

function triageSubtree(path: string, depth: number): DraftItem[] {
  if (depth === TREE_DEPTH) {
    const blockId = `resolve-${path}`;
    triageBlocks[blockId] = {
      kind: 'step',
      name: `Resolve ${path}`,
      description: `Applies the resolution playbook for routing outcome ${path}.`,
      location: location('src/triage/resolve.ts', 10 + depth, 3),
    };
    return [{ blockId, outcome: 'succeeded', children: [] }];
  }
  const blockId = path === '' ? 'triage-root' : `triage-${path}`;
  triageBlocks[blockId] ??= {
    kind: 'decision',
    name: path === '' ? 'Route intake' : `Route ${path}`,
    description: 'Routes the ticket one level deeper by matching its signals.',
    location: location('src/triage/route.ts', 20 + depth, 5),
    arms: literalArms('match', 'fallthrough'),
  };
  return [
    {
      blockId,
      outcome: 'succeeded',
      selectedArm: selected('match'),
      children: triageSubtree(`${path}m`, depth + 1),
    },
    {
      blockId,
      outcome: 'succeeded',
      selectedArm: selected('fallthrough'),
      children: triageSubtree(`${path}f`, depth + 1),
    },
  ];
}

const triageExecution = triageSubtree('', 0);

const triageStory = artifact({
  name: 'Support triage',
  description:
    'Routes an incoming support ticket through the full escalation tree.',
  blocks: triageBlocks,
  scenarios: [
    {
      name: 'Exhaustive routing sweep',
      description: 'Exercises every routing arm across the whole tree.',
      location: location(triageStoryId, 9, 3),
      outcome: 'succeeded',
      execution: triageExecution,
    },
  ],
});

export const storiesFixtureReport = {
  stories: {
    [checkoutStoryId]: checkoutStory,
    [refundStoryId]: refundStory,
    [triageStoryId]: triageStory,
  },
} satisfies StoriesRun;

export const singleStoryFixtureReport = {
  stories: { [checkoutStoryId]: checkoutStory },
} satisfies StoriesRun;

export const emptyStoriesFixtureReport = {
  stories: {},
} satisfies StoriesRun;

export const storiesFixtureCatalog = {
  modules: [
    {
      modulePath: 'src/orders',
      description: 'Checkout and post-purchase order behavior.',
      stories: [
        {
          storyPath: checkoutStoryId,
          storyKey: 'checkout',
          modulePath: 'src/orders',
          name: checkoutStory.name,
          description: checkoutStory.description,
        },
        {
          storyPath: refundStoryId,
          storyKey: 'refund',
          modulePath: 'src/orders',
          name: refundStory.name,
          description: refundStory.description,
        },
      ],
    },
    {
      modulePath: 'src/support',
      description: 'Support intake and escalation behavior.',
      stories: [
        {
          storyPath: triageStoryId,
          storyKey: 'triage',
          modulePath: 'src/support',
          name: triageStory.name,
          description: triageStory.description,
        },
      ],
    },
  ],
} satisfies StoryCatalog;

export const projectNarrativeFixture = {
  kind: 'project-narrative',
  name: 'Commerce',
  content: 'Commerce is organized around order behavior.',
} satisfies ProjectNarrative;

export const emptyStoriesFixtureCatalog = {
  modules: [],
} satisfies StoryCatalog;
