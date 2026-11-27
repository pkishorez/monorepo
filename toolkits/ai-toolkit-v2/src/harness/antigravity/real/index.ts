import { NodeServices } from '@effect/platform-node';
import { Layer } from 'effect';
import * as Router from '../shared/index.ts';
import * as Agy from './agy.ts';

export type Options = Router.Options & Agy.Options;

export const layer = (options: Options = {}) =>
  Router.layer(options).pipe(
    Layer.provide(Agy.layer(options)),
    Layer.provide(NodeServices.layer),
  );
