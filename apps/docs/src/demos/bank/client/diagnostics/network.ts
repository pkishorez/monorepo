import { Data, Effect } from 'effect';
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
}

export const makeNetwork = (): Network => {
  const quality = makeLiveValue<NetworkQuality>('fast');
  return {
    quality,
    travel: Effect.suspend(() =>
      Effect.sleep(LATENCY[quality.get()]).pipe(
        Effect.flatMap(() =>
          quality.get() === 'offline'
            ? Effect.fail(new NetworkDown())
            : Effect.void,
        ),
      ),
    ),
  };
};
