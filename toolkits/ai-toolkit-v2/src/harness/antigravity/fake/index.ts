import { Layer } from 'effect';
import {
  layer as routerLayer,
  type Options as RouterOptions,
} from '../shared/index.ts';
import {
  layer as driverLayer,
  type Options as DriverOptions,
} from './driver.ts';
import { agent, recordings } from './recordings/index.ts';

export { agent, recordings } from './recordings/index.ts';

export const layer = (options: Options = {}) =>
  routerLayer(options).pipe(
    Layer.provide(driverLayer({ agent, recordings, ...options })),
  );

export type { Agent, Recording, Step } from './recordings/index.ts';
export interface Options extends RouterOptions, Partial<DriverOptions> {}
