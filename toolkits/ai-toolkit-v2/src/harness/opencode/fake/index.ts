import { type Duration, Layer } from 'effect';
import { OpenCode } from '../contract/index.js';
import { makeOpenCode } from '../shared/index.js';
import { type FakeOptions, layerFake } from './driver.js';

export { methods, type Recording, recordings } from './recordings/index.js';

export interface LayerOptions extends FakeOptions {
  readonly linger?: Duration.Input;
}

export const layer = (options: LayerOptions = {}) =>
  Layer.effect(OpenCode, makeOpenCode({ linger: options.linger })).pipe(
    Layer.provide(layerFake(options)),
  );
