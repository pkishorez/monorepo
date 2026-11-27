import { existsSync } from 'node:fs';
import { delimiter, join } from 'node:path';
import { Duration, Layer } from 'effect';
import { Claude } from '../contract/index.js';
import { makeClaude } from '../shared/index.js';
import { layerReal } from './driver.js';

export interface LayerOptions {
  readonly linger?: Duration.Input;
  readonly executable?: string;
}

const installed = (): string | undefined =>
  (process.env['PATH'] ?? '')
    .split(delimiter)
    .filter((dir) => dir !== '')
    .map((dir) =>
      join(dir, process.platform === 'win32' ? 'claude.exe' : 'claude'),
    )
    .find(existsSync);

export const layer = (options: LayerOptions = {}) =>
  Layer.effect(
    Claude,
    makeClaude({
      ...(options.linger === undefined ? {} : { linger: options.linger }),
      env: process.env,
      executable: options.executable ?? installed(),
    }),
  ).pipe(Layer.provide(layerReal));
