import { Layer } from 'effect';
import * as Router from '../shared/index.ts';
import * as Driver from './driver.ts';
import {
  answers,
  recordings,
  type Answers,
  type Recording,
} from './recordings/index.ts';

export {
  answers,
  recordings,
  type Answers,
  type Recording,
  type Step,
} from './recordings/index.ts';

export interface Options extends Router.Options {
  readonly recordings?: Readonly<Record<string, Recording>>;
  readonly answers?: Answers;
}

export const layer = (options: Options = {}) =>
  Router.layer(options).pipe(
    Layer.provide(
      Driver.layer({
        recordings: options.recordings ?? recordings,
        answers: options.answers ?? answers,
      }),
    ),
  );
