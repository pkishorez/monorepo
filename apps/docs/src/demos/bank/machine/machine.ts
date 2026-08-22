import { Effect } from 'effect';
import { nextUlid } from 'std-toolkit/core';
import { assign, enqueueActions, fromPromise, setup } from 'xstate';
import { explain, type Problem } from './problem/index.ts';

export interface TransferRequest {
  readonly id: string;
  readonly from: string;
  readonly to: string;
  readonly amount: number;
}

export type FlightPhase = 'sending' | 'refused' | 'failed';

export interface Flight extends TransferRequest {
  readonly phase: FlightPhase;
  readonly problem: Problem | null;
  readonly attempt: number;
}

export interface JourneyInput {
  readonly send: (request: TransferRequest) => Promise<unknown>;
}

export interface JourneyContext {
  readonly send: JourneyInput['send'];
  readonly fromId: string | null;
  readonly toId: string | null;
  readonly flights: Readonly<Record<string, Flight>>;
}

export type JourneyEvent =
  | { type: 'PICK'; accountId: string }
  | { type: 'CANCEL' }
  | { type: 'UNTARGET' }
  | { type: 'SWAP' }
  | { type: 'SEND'; amount: number; stay?: boolean }
  | { type: 'RETRY'; id: string }
  | { type: 'DISMISS'; id: string };

const SEPARATOR = '#';

const actorIdOf = (flight: Flight): string =>
  `${flight.id}${SEPARATOR}${flight.attempt}`;

const flightIdOf = (actorId: string): string =>
  actorId.slice(0, actorId.indexOf(SEPARATOR));

const doneActorId = (eventType: string): string =>
  eventType.slice(eventType.lastIndexOf('.') + 1);

const without = (
  flights: JourneyContext['flights'],
  id: string,
): JourneyContext['flights'] => {
  const { [id]: _dropped, ...rest } = flights;
  return rest;
};

export const journeyMachine = setup({
  types: {
    input: {} as JourneyInput,
    context: {} as JourneyContext,
    events: {} as JourneyEvent,
  },
  actors: {
    settle: fromPromise(
      ({
        input,
      }: {
        input: { send: JourneyInput['send']; request: TransferRequest };
      }) => input.send(input.request),
    ),
  },
  guards: {
    isFrom: ({ context, event }) =>
      event.type === 'PICK' && event.accountId === context.fromId,
    isTo: ({ context, event }) =>
      event.type === 'PICK' && event.accountId === context.toId,
  },
  actions: {
    launch: enqueueActions(
      ({ context, enqueue }, params: { flight: Flight }) => {
        enqueue.assign({
          flights: { ...context.flights, [params.flight.id]: params.flight },
        });
        enqueue.spawnChild('settle', {
          id: actorIdOf(params.flight),
          input: { send: context.send, request: params.flight },
        });
      },
    ),
    launchFromContext: enqueueActions(({ context, event, enqueue }) => {
      if (event.type !== 'SEND') return;
      const flight: Flight = {
        id: Effect.runSync(nextUlid),
        from: context.fromId!,
        to: context.toId!,
        amount: event.amount,
        phase: 'sending',
        problem: null,
        attempt: 0,
      };
      enqueue.assign({ flights: { ...context.flights, [flight.id]: flight } });
      enqueue.spawnChild('settle', {
        id: actorIdOf(flight),
        input: { send: context.send, request: flight },
      });
    }),
    clear: assign({ fromId: null, toId: null }),
  },
}).createMachine({
  id: 'bank-journey',
  context: ({ input }) => ({
    send: input.send,
    fromId: null,
    toId: null,
    flights: {},
  }),
  on: {
    'xstate.done.actor.*': {
      actions: assign({
        flights: ({ context, event }) =>
          without(context.flights, flightIdOf(doneActorId(event.type))),
      }),
    },
    'xstate.error.actor.*': {
      actions: assign({
        flights: ({ context, event }) => {
          const id = flightIdOf(doneActorId(event.type));
          const flight = context.flights[id];
          if (flight === undefined) return context.flights;
          const problem = explain(
            (event as unknown as { error: unknown }).error,
          );
          return {
            ...context.flights,
            [id]: {
              ...flight,
              phase: problem.kind === 'refusal' ? 'refused' : 'failed',
              problem,
            },
          };
        },
      }),
    },
    RETRY: {
      actions: enqueueActions(({ context, event, enqueue }) => {
        const flight = context.flights[event.id];
        if (flight === undefined || flight.phase === 'sending') return;
        enqueue({
          type: 'launch',
          params: {
            flight: {
              ...flight,
              phase: 'sending',
              problem: null,
              attempt: flight.attempt + 1,
            },
          },
        });
      }),
    },
    DISMISS: {
      actions: assign({
        flights: ({ context, event }) => without(context.flights, event.id),
      }),
    },
  },
  initial: 'idle',
  states: {
    idle: {
      entry: 'clear',
      on: {
        PICK: {
          target: 'armed',
          actions: assign({ fromId: ({ event }) => event.accountId }),
        },
      },
    },
    armed: {
      on: {
        CANCEL: 'idle',
        PICK: [
          { guard: 'isFrom', target: 'idle' },
          {
            target: 'typing',
            actions: assign({ toId: ({ event }) => event.accountId }),
          },
        ],
      },
    },
    typing: {
      on: {
        CANCEL: 'idle',
        UNTARGET: { target: 'armed', actions: assign({ toId: null }) },
        SWAP: {
          actions: assign({
            fromId: ({ context }) => context.toId,
            toId: ({ context }) => context.fromId,
          }),
        },
        PICK: [
          { guard: 'isFrom', target: 'idle' },
          { guard: 'isTo', target: 'armed', actions: assign({ toId: null }) },
          { actions: assign({ toId: ({ event }) => event.accountId }) },
        ],
        SEND: [
          {
            guard: ({ event }) => event.stay === true,
            actions: 'launchFromContext',
          },
          {
            target: 'armed',
            actions: ['launchFromContext', assign({ toId: null })],
          },
        ],
      },
    },
  },
});
