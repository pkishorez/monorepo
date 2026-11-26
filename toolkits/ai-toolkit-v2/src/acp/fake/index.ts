import { Effect, Layer } from 'effect';
import type { Array, Context, Scope } from 'effect';
import type { AcpAgent } from '../contract/index.ts';
import * as Router from '../shared/index.ts';
import * as Driver from './driver.ts';
import { recordings } from './recordings/index.ts';
import type { Recording } from './recordings/index.ts';

export { recordings } from './recordings/index.ts';
export type { Recording, Step } from './recordings/index.ts';

export interface Options extends Router.Options {
  readonly recordings?: Array.NonEmptyReadonlyArray<Recording>;
}

export const make = (
  options: Options = {},
): Effect.Effect<AcpAgent, never, Scope.Scope> =>
  Effect.gen(function* () {
    const driver = yield* Layer.build(
      Driver.layer(options.recordings ?? recordings),
    );
    return yield* Router.make(options).pipe(Effect.provide(driver));
  });

export const layer = <I>(
  tag: Context.Key<I, AcpAgent>,
  options: Options = {},
) => Layer.effect(tag, make(options));
