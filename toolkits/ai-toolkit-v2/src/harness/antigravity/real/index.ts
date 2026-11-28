import { NodeServices } from '@effect/platform-node';
import { Layer } from 'effect';
import {
  layer as routerLayer,
  type Options as RouterOptions,
} from '../shared/index.ts';
import { layer as agyLayer, type Options as AgyOptions } from './agy.ts';

export const layer = (options: Options = {}) =>
  routerLayer(options).pipe(
    Layer.provide(agyLayer(options)),
    Layer.provide(NodeServices.layer),
  );

export type Options = RouterOptions & AgyOptions;
