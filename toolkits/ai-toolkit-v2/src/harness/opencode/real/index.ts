import { type Duration, Layer } from 'effect';
import { type HostOptions, OpenCode } from '../contract/index.js';
import { makeOpenCode } from '../shared/index.js';
import { layerReal } from './driver.js';

export const layer = (options: LayerOptions = {}) =>
  Layer.effect(OpenCode, makeOpenCode({ linger: options.linger })).pipe(
    Layer.provide(layerReal(options.host ?? {})),
  );

export interface LayerOptions {
  readonly linger?: Duration.Input;
  readonly host?: HostOptions;
}
