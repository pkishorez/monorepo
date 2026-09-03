import type { Effect } from 'effect';
import type { HandlerName } from '../../domain/identity/index.js';
import type { OutboxFlow } from '../../flow/sync-flow/index.js';
import type { Request } from '../entries/index.js';

export type Handler = {
  readonly flow?: OutboxFlow | null;
} & (
  | {
      readonly kind: 'entity';
      readonly send: (request: Request) => Effect.Effect<void, unknown>;
    }
  | {
      readonly kind: 'action';
      readonly send: (
        payload: unknown,
        entryId: string,
      ) => Effect.Effect<void, unknown>;
    }
);

export type Handlers = {
  readonly register: (name: HandlerName, handler: Handler) => void;
  readonly lookup: (name: HandlerName) => Handler | null;
};

export const makeHandlers = (): Handlers => {
  const handlers = new Map<HandlerName, Handler>();
  return {
    register: (name, handler) => {
      if (handlers.has(name)) {
        throw new Error(
          `[sync] outbox handler "${name}" is already registered`,
        );
      }
      handlers.set(name, handler);
    },
    lookup: (name) => handlers.get(name) ?? null,
  };
};
