import { NodeServices } from '@effect/platform-node';
import { Effect, Layer } from 'effect';
import type { Context, Scope } from 'effect';
import type { AcpAgent } from '../contract/index.ts';
import * as Router from '../shared/index.ts';
import * as Process from './process.ts';

export type Options = Router.Options & Process.Options;

export const make = (
  options: Options,
): Effect.Effect<AcpAgent, never, Scope.Scope> =>
  Effect.gen(function* () {
    const driver = yield* Layer.build(
      Process.layer(options).pipe(Layer.provide(NodeServices.layer)),
    );
    return yield* Router.make(options).pipe(Effect.provide(driver));
  });

export const layer = <I>(tag: Context.Key<I, AcpAgent>, options: Options) =>
  Layer.effect(tag, make(options));
