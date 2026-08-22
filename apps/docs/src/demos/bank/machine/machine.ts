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
  | { type: 'SEND'; amount: number }
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

export const busyAccounts = (context: JourneyContext): ReadonlySet<string> => {
  const busy = new Set<string>();
  for (const flight of Object.values(context.flights)) {
    if (flight.phase !== 'sending') continue;
    busy.add(flight.from);
    busy.add(flight.to);
  }
  return busy;
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
    free: ({ context, event }) =>
      event.type === 'PICK' && !busyAccounts(context).has(event.accountId),
    bothFree: ({ context, event }) => {
      if (event.type !== 'PICK' || context.fromId === null) return false;
      const busy = busyAccounts(context);
      return !busy.has(event.accountId) && !busy.has(context.fromId);
    },
    isFrom: ({ context, event }) =>
      event.type === 'PICK' && event.accountId === context.fromId,
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
          guard: 'free',
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
            guard: 'bothFree',
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
        PICK: [
          { guard: 'isFrom', target: 'idle' },
          {
            guard: 'bothFree',
            actions: assign({ toId: ({ event }) => event.accountId }),
          },
        ],
        SEND: {
          target: 'armed',
          actions: enqueueActions(({ context, event, enqueue }) => {
            enqueue({
              type: 'launch',
              params: {
                flight: {
                  id: Effect.runSync(nextUlid),
                  from: context.fromId!,
                  to: context.toId!,
                  amount: event.amount,
                  phase: 'sending',
                  problem: null,
                  attempt: 0,
                },
              },
            });
            enqueue.assign({ toId: null });
          }),
        },
      },
    },
  },
});
