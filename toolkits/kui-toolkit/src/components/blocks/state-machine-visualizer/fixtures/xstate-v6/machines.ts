import { createMachine, createMachineFromConfig } from 'xstate-v6';

export const trafficLightMachineV6 = createMachine({
  id: 'traffic-light-v6',
  initial: 'red',
  states: {
    red: {
      description: 'Traffic is stopped.',
      timeout: 20_000,
      onTimeout: { target: 'green' },
    },
    green: {
      description: 'Traffic may proceed.',
      timeout: 15_000,
      onTimeout: { target: 'yellow' },
    },
    yellow: {
      description: 'The signal is about to change.',
      after: { 3000: { target: 'red' } },
    },
  },
});

/**
 * Choice states declared as `choice: [...]` branches. Only this JSON authoring
 * form keeps the branch targets statically readable, so it is the only form the
 * visualizer can draw outgoing edges for.
 */
export const checkoutMachineV6 = createMachineFromConfig(
  {
    id: 'checkout-v6',
    initial: 'cart',
    context: { vip: false, total: 0 },
    delays: { RETRY_DELAY: 5000 },
    states: {
      cart: {
        description: 'Items are being collected.',
        on: { CHECKOUT: { target: 'routing' } },
      },
      routing: {
        type: 'choice',
        description:
          'A pure routing decision that picks a checkout lane from the customer tier and basket size, without waiting for an event.',
        choice: [
          {
            when: { type: 'isVip' },
            target: 'expressLane',
            description: 'VIP customer',
          },
          {
            when: { type: 'isLargeBasket' },
            target: 'reviewLane',
            description: 'Large basket',
          },
          { target: 'standardLane' },
        ],
      },
      expressLane: {
        description: 'Priority handling for VIP customers.',
        on: { PAY: { target: 'charging' } },
      },
      reviewLane: {
        description: 'A human checks the basket before payment.',
        on: {
          APPROVE: { target: 'charging' },
          REJECT: { target: 'cancelled' },
        },
      },
      standardLane: {
        description: 'The regular queue.',
        on: { PAY: { target: 'charging' } },
      },
      charging: {
        description: 'Payment is being authorized.',
        timeout: 30_000,
        onTimeout: { target: 'timedOut' },
        onError: { target: 'failed' },
        after: { RETRY_DELAY: { target: 'charging' } },
        on: { APPROVED: { target: 'complete' } },
      },
      timedOut: {
        description: 'The payment provider did not answer.',
        on: {
          RETRY: { target: 'charging' },
          CANCEL: { target: 'cancelled' },
        },
      },
      failed: {
        description: 'Payment could not be completed.',
        type: 'final',
      },
      complete: { type: 'final' },
      cancelled: { type: 'final' },
    },
  },
  {
    guards: {
      isVip: ({ context }: { context: { vip: boolean } }) => context.vip,
      isLargeBasket: ({ context }: { context: { total: number } }) =>
        context.total > 500,
    },
  },
);

/**
 * The same decision authored as a `choice` function. The branch targets live
 * inside the closure, so the visualizer renders the node without outgoing edges
 * and the lanes it picks between look unreachable.
 */
export const runtimeChoiceMachineV6 = createMachine({
  context: { vip: false },
  id: 'runtime-choice-v6',
  initial: 'cart',
  states: {
    cart: {
      description: 'Items are being collected.',
      on: { CHECKOUT: { target: 'routing' } },
    },
    routing: {
      type: 'choice',
      description:
        'The targets are computed inside a function, so the graph cannot show where this node leads.',
      choice: ({ context }) => ({
        target: context.vip ? 'expressLane' : 'standardLane',
      }),
    },
    expressLane: {
      description: 'Only reachable through the choice function.',
      type: 'final',
    },
    standardLane: {
      description: 'Only reachable through the choice function.',
      type: 'final',
    },
  },
});

export const documentReviewMachineV6 = createMachine({
  id: 'document-review-v6',
  initial: 'editing',
  states: {
    editing: {
      description: 'The author prepares a new revision.',
      on: { SUBMIT: { target: 'review' } },
    },
    review: {
      type: 'parallel',
      states: {
        legal: {
          initial: 'pending',
          states: {
            pending: { on: { LEGAL_APPROVE: { target: 'approved' } } },
            approved: { type: 'final' },
          },
        },
        security: {
          initial: 'pending',
          states: {
            pending: { on: { SECURITY_APPROVE: { target: 'approved' } } },
            approved: { type: 'final' },
          },
        },
        editorial: {
          initial: 'pending',
          states: {
            pending: { on: { EDITORIAL_APPROVE: { target: 'approved' } } },
            approved: { type: 'final' },
          },
        },
      },
      onDone: { target: 'approved' },
      on: { REQUEST_CHANGES: { target: 'editing' } },
    },
    approved: {
      description:
        'Every review track has approved the document, so it is ready to be published to the shared library and announced to the whole team.',
      type: 'final',
    },
  },
});
