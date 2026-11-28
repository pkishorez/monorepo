import { Layer } from 'effect';
import {
  layer as routerLayer,
  type Options as RouterOptions,
} from '../shared/index.ts';
import {
  layer as appServerLayer,
  type Options as AppServerOptions,
} from './app-server.ts';

export const driver = appServerLayer;

export const layer = (options: Options = {}) =>
  routerLayer(options).pipe(Layer.provide(appServerLayer(options)));

export type Options = RouterOptions & AppServerOptions;
