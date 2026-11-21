import { Effect, Layer, Stream } from 'effect';
import { HarnessHost, Models } from '@kestack/ai-toolkit/harness';
import {
  type FakeHarness,
  makeFakeHarness,
} from '@kestack/ai-toolkit/harness/fake';
import { Speech } from '@kestack/ai-toolkit/speech';
import { HOME } from '../../connection/plugins/code/engine/services/file-system/fake/index.js';
import type { AgentEdges } from '../index.js';

/*
 * What every computer's code Plugin in a test tab shares: the fake harness,
 * and a Harness Host, Models and Speech that answer plainly. The Agent and
 * Speech fakes take their place in an App.
 */

/** A Harness Host where every binary runs and each harness keeps its config under home. */
const host = Layer.succeed(HarnessHost, {
  binaryAt: (harness) =>
    Effect.succeed({
      path: `/usr/local/bin/${harness.name}`,
      version: '1.0.0',
      error: null,
      isDefault: true,
    }),
  checkBinary: (_, given) => Effect.succeed(given),
  configFolderOf: (harness, configFolder) =>
    Effect.succeed(
      configFolder === undefined
        ? { path: `${HOME}/.${harness}`, from: 'default' }
        : { path: configFolder, from: 'account' },
    ),
});

const models = Layer.succeed(Models, {
  list: () =>
    Effect.succeed([
      { id: 'claude-test', name: 'Claude Test', releaseDate: null },
    ]),
  defaultModel: (harness) => Effect.succeed(harness.defaultModel),
});

const speech = Layer.succeed(Speech, {
  enable: Effect.void,
  disable: Effect.void,
  watch: Stream.make({ _tag: 'Off' } as const),
  transcribe: () => Effect.succeed(''),
  watchTake: () => Stream.empty,
  addTakeAudio: () => Effect.void,
  endTake: () => Effect.void,
});

/** What every computer's code Plugin shares: the Agent's and Speech's edges, over `harness`, a fresh one unless given. */
export const agentEdges = (
  harness: FakeHarness = makeFakeHarness(),
): Layer.Layer<AgentEdges> =>
  Layer.mergeAll(harness.layer, host, models, speech);
