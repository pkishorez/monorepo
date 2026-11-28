import { Layer } from 'effect';
import {
  layer as routerLayer,
  type Options as RouterOptions,
} from '../shared/index.ts';
import { layer as driverLayer } from './driver.ts';
import {
  answers,
  recordings,
  type Answers,
  type Recording,
} from './recordings/index.ts';

export { answers, recordings } from './recordings/index.ts';

export const layer = (options: Options = {}) =>
  routerLayer(options).pipe(
    Layer.provide(
      driverLayer({
        recordings: options.recordings ?? recordings,
        answers: options.answers ?? answers,
      }),
    ),
  );

export type { Answers, Recording, Step } from './recordings/index.ts';
export interface Options extends RouterOptions {
  readonly recordings?: Readonly<Record<string, Recording>>;
  readonly answers?: Answers;
}
