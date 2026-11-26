import { Layer } from 'effect';
import * as Router from '../shared/index.ts';
import * as Driver from './driver.ts';
import { agent, recordings } from './recordings/index.ts';

export {
  agent,
  recordings,
  type Agent,
  type Recording,
  type Step,
} from './recordings/index.ts';

export interface Options extends Router.Options, Partial<Driver.Options> {}

export const layer = (options: Options = {}) =>
  Router.layer(options).pipe(
    Layer.provide(Driver.layer({ agent, recordings, ...options })),
  );
