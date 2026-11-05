import { join } from 'node:path';
import { Effect, Layer } from 'effect';
import { makeFakeHarness } from '@kestack/ai-toolkit/harness/fake';
import { makeFakeSpeech } from '@kestack/ai-toolkit/speech/fake';
import { Plugin, PluginFolders } from '@kestack/cli-platform/plugins/plugin';
import { CodeApi } from '../../../plugins/code/api/index.js';
import { codePlugin } from '../../../plugins/code/index.js';

/* The code Plugin as main.ts makes it, on a fake harness and fake Speech to Text. */

export const runFakeCode = () =>
  Plugin.make({
    name: 'code',
    group: CodeApi,
    layer: Layer.unwrap(
      Effect.map(
        PluginFolders,
        ({ data }) =>
          codePlugin({
            db: join(data, 'code.db'),
            harnesses: makeFakeHarness().layer,
            speech: makeFakeSpeech().layer,
            home: data,
          }).layer,
      ),
    ),
  })();
