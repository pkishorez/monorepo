import { Layer, type Duration } from 'effect';
import { Claude } from '../contract/index.js';
import { makeClaude } from '../shared/index.js';
import { layerFake as driverFake } from './driver.js';
import {
  answers,
  recordings,
  type Answers,
  type Recording,
} from './recordings/index.js';

export interface FakeOptions {
  readonly linger?: Duration.Input;
  readonly recordings?: ReadonlyArray<Recording>;
  readonly answers?: Answers;
}

export const layer = (options: FakeOptions = {}) =>
  Layer.effect(
    Claude,
    makeClaude({
      ...(options.linger === undefined ? {} : { linger: options.linger }),
      env: {},
      executable: 'claude',
    }),
  ).pipe(
    Layer.provide(
      driverFake(options.recordings ?? recordings, options.answers ?? answers),
    ),
  );
