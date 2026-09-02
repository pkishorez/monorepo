import { Data, Effect } from 'effect';
import { OutboxUnreachable, type Connectivity } from 'std-toolkit/sync';
import { makeLiveValue, type LiveValue } from '../live-value.ts';

export const NETWORK_QUALITIES = ['fast', 'slow', 'offline'] as const;

export type NetworkQuality = (typeof NETWORK_QUALITIES)[number];

export class NetworkDown extends Data.TaggedError('NetworkDown')<{}> {}

const LATENCY: Record<NetworkQuality, `${number} millis`> = {
  fast: '150 millis',
  slow: '2500 millis',
  offline: '800 millis',
};

export interface Network {
  readonly quality: LiveValue<NetworkQuality>;
  /** Simulates the hop to the bank: a delay, then a NetworkDown when offline. */
  readonly travel: Effect.Effect<void, NetworkDown>;
  /** The same hop, but offline tells the Outbox to keep the write pending. */
  readonly reach: Effect.Effect<void, OutboxUnreachable>;
  /** What the Outbox Drainer believes: the simulated toggle AND the browser. */
  readonly connectivity: (browser: Connectivity | undefined) => Connectivity;
}

export const makeNetwork = (): Network => {
  const quality = makeLiveValue<NetworkQuality>('fast');
  const travel = Effect.suspend(() =>
    Effect.sleep(LATENCY[quality.get()]).pipe(
      Effect.flatMap(() =>
        quality.get() === 'offline'
          ? Effect.fail(new NetworkDown())
          : Effect.void,
      ),
    ),
  );
  return {
    quality,
    travel,
    reach: travel.pipe(
      Effect.mapError(
        () => new OutboxUnreachable({ message: 'The network is offline' }),
      ),
    ),
    connectivity: (browser) => ({
      isOnline: () =>
        quality.get() !== 'offline' && (browser?.isOnline() ?? true),
      subscribe: (listener) => {
        const offQuality = quality.subscribe(listener);
        const offBrowser = browser?.subscribe(listener);
        return () => {
          offQuality();
          offBrowser?.();
        };
      },
    }),
  };
};
