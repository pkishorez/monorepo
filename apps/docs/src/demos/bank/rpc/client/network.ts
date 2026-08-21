import { Context, Data, Effect, Layer } from 'effect';

export const NETWORK_QUALITIES = ['fast', 'slow', 'offline'] as const;

export type NetworkQuality = (typeof NETWORK_QUALITIES)[number];

export class NetworkDown extends Data.TaggedError('NetworkDown')<{}> {}

const LATENCY: Record<NetworkQuality, `${number} millis`> = {
  fast: '150 millis',
  slow: '2500 millis',
  offline: '800 millis',
};

export class Network extends Context.Service<
  Network,
  {
    readonly get: () => NetworkQuality;
    readonly set: (quality: NetworkQuality) => void;
    readonly travel: Effect.Effect<void, NetworkDown>;
  }
>()('BankNetwork') {}

export const NetworkLive: Layer.Layer<Network> = Layer.sync(Network, () => {
  let quality: NetworkQuality = 'fast';
  return {
    get: () => quality,
    set: (next) => {
      quality = next;
    },
    travel: Effect.suspend(() =>
      Effect.sleep(LATENCY[quality]).pipe(
        Effect.flatMap(() =>
          quality === 'offline' ? Effect.fail(new NetworkDown()) : Effect.void,
        ),
      ),
    ),
  };
});
