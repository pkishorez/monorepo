import { Effect, Layer, Queue } from 'effect';
import { type Ask, Dictations } from '../capabilities/index.ts';

/** The Dictation's asks, in one queue for the app. */
export const layer: Layer.Layer<Dictations> = Layer.effect(
  Dictations,
  Effect.map(Queue.unbounded<typeof Ask.Type>(), (asked) => ({ asked })),
);
