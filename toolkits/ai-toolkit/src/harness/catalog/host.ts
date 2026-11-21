import { Effect, Layer } from 'effect';
import { binaryAt, HarnessHost } from '../contract/index.js';
import { checkBinary, configFolderOf } from './binaries.js';

/** The Harness Host on this computer: binaries run, the process's environment read. */
export const harnessHostLayer: Layer.Layer<HarnessHost> = Layer.succeed(
  HarnessHost,
  {
    binaryAt,
    checkBinary,
    configFolderOf: (harness, configFolder) =>
      Effect.sync(() => configFolderOf(harness, configFolder)),
  },
);
