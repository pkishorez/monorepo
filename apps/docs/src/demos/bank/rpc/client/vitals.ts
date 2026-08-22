import type { ConnectionStatus } from '@pkishorez/effect-cloudflare/websocket-rpc-client';
import type { LeadershipState } from 'std-toolkit/sync';

export interface BankVitals {
  readonly ws: {
    readonly status: ConnectionStatus;
    readonly reconnects: number;
  } | null;
  readonly leadership: Readonly<Record<string, LeadershipState>>;
  readonly queued: number;
  readonly committing: number;
}

export interface VitalsStore {
  readonly get: () => BankVitals;
  readonly subscribe: (listener: () => void) => () => void;
  readonly update: (patch: (vitals: BankVitals) => BankVitals) => void;
}

export const makeVitals = (initial: BankVitals): VitalsStore => {
  let state = initial;
  const listeners = new Set<() => void>();
  return {
    get: () => state,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    update: (patch) => {
      state = patch(state);
      listeners.forEach((listener) => listener());
    },
  };
};
