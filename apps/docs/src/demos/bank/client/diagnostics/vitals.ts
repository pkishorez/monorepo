import { Effect, Stream } from 'effect';
import type { ConnectionStatus } from '@pkishorez/effect-cloudflare/websocket-rpc-client';
import type { LeadershipState } from 'std-toolkit/sync';
import { makeLiveValue, type LiveValue } from '../live-value.ts';

export interface BankVitals {
  readonly ws: {
    readonly status: ConnectionStatus;
    readonly reconnects: number;
  } | null;
  readonly leadership: Readonly<Record<string, LeadershipState>>;
  readonly queued: number;
  readonly committing: number;
}

export interface Vitals extends LiveValue<BankVitals> {
  readonly patch: (
    fn: (vitals: BankVitals) => Partial<BankVitals>,
  ) => Effect.Effect<void>;
  readonly lead: (
    collection: string,
    state: LeadershipState,
  ) => Effect.Effect<void>;
  readonly followConnection: (
    status: Stream.Stream<ConnectionStatus>,
  ) => Effect.Effect<void>;
}

export const makeVitals = (connected: boolean): Vitals => {
  const value = makeLiveValue<BankVitals>({
    ws: connected ? { status: 'connecting', reconnects: 0 } : null,
    leadership: {},
    queued: 0,
    committing: 0,
  });
  const patch: Vitals['patch'] = (fn) =>
    Effect.sync(() => value.update((v) => ({ ...v, ...fn(v) })));
  return {
    ...value,
    patch,
    lead: (collection, state) =>
      patch((v) => ({ leadership: { ...v.leadership, [collection]: state } })),
    followConnection: (status) =>
      Stream.runForEach(status, (next) =>
        patch((v) => ({
          ws: {
            status: next,
            reconnects:
              (v.ws?.reconnects ?? 0) + (next === 'reconnecting' ? 1 : 0),
          },
        })),
      ),
  };
};
