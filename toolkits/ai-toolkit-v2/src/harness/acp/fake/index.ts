import { Effect, Layer } from 'effect';
import type { Array, Context, Scope } from 'effect';
import type { AcpAgent } from '../contract/index.ts';
import {
  make as makeRouter,
  type Options as RouterOptions,
} from '../shared/index.ts';
import { layer as driverLayer } from './driver.ts';
import { recordings } from './recordings/index.ts';
import type { Recording } from './recordings/index.ts';

export { recordings } from './recordings/index.ts';

export const make = (
  options: Options = {},
): Effect.Effect<AcpAgent, never, Scope.Scope> =>
  Effect.gen(function* () {
    const driver = yield* Layer.build(
      driverLayer(options.recordings ?? recordings),
    );
    return yield* makeRouter(options).pipe(Effect.provide(driver));
  });

export const layer = <I>(
  tag: Context.Key<I, AcpAgent>,
  options: Options = {},
) => Layer.effect(tag, make(options));

export type { Recording, Step } from './recordings/index.ts';
export interface Options extends RouterOptions {
  readonly recordings?: Array.NonEmptyReadonlyArray<Recording>;
}
