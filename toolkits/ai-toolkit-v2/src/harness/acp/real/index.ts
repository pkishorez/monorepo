import { NodeServices } from '@effect/platform-node';
import { Effect, Layer } from 'effect';
import type { Context, Scope } from 'effect';
import type { AcpAgent } from '../contract/index.ts';
import {
  make as makeRouter,
  type Options as RouterOptions,
} from '../shared/index.ts';
import {
  layer as processLayer,
  type Options as ProcessOptions,
} from './process.ts';

export const make = (
  options: Options,
): Effect.Effect<AcpAgent, never, Scope.Scope> =>
  Effect.gen(function* () {
    const driver = yield* Layer.build(
      processLayer(options).pipe(Layer.provide(NodeServices.layer)),
    );
    return yield* makeRouter(options).pipe(Effect.provide(driver));
  });

export const layer = <I>(tag: Context.Key<I, AcpAgent>, options: Options) =>
  Layer.effect(tag, make(options));

export type Options = RouterOptions & ProcessOptions;
