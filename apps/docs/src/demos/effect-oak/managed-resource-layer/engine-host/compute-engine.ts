import { Context, Effect, Layer } from 'effect';

/** A pretend resource with an id, built and torn down by its Layer. */
export type Engine = {
  readonly engineId: string;
  readonly square: (value: number) => number;
};

export class ComputeEngine extends Context.Service<ComputeEngine, Engine>()(
  'docs/managed-resource-layer/ComputeEngine',
) {}

export const engineLayer = Layer.effect(
  ComputeEngine,
  Effect.acquireRelease(
    Effect.sync(() => ({
      engineId: `engine-${crypto.randomUUID().slice(0, 8)}`,
      square: (value: number) => value * value,
    })),
    ({ engineId }) => Effect.log(`Tore down ${engineId}`),
  ),
);
