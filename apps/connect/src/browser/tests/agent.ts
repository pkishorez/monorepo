import { Context, Effect, Layer } from 'effect';
import { Runtime } from '@kestack/kabuki';
import { HarnessHost, Models } from '@kestack/ai-toolkit/harness';
import {
  agent,
  agentOver,
  type FakeHarness,
} from '@kestack/ai-toolkit/harness/fake';
import { Speech } from '@kestack/ai-toolkit/speech';
import { speech } from '@kestack/ai-toolkit/speech/fake';
import { HOME } from '../../connection/plugins/code/engine/services/file-system/fake/index.js';
import type { AgentEdges } from '../index.js';

/*
 * What every computer's code Plugin in a test tab shares: the Agent and
 * Speech fakes, as an App's Fake World serves them, each run until the
 * Scope closes and the Agent's replies at no pace. A test that drives its
 * harness Turn by Turn gives `makeFakeHarness`'s, which takes the place of
 * the Agent fake's harnesses and One-shot Prompt.
 */

/** The Agent and Speech fakes' edges, the Agent's config folders under the File System fake's home. */
const fakes = Layer.unwrap(
  Effect.gen(function* () {
    const agentRuntime = yield* Runtime.scoped(agent.actor);
    agentRuntime.root.send({ _tag: 'SetPace', ms: 0 });
    const speechRuntime = yield* Runtime.scoped(speech.actor);
    return Layer.merge(
      agentOver(agentRuntime, { home: HOME }),
      speech.serve(speechRuntime),
    );
  }),
);

/** The Agent fake's Harness Host and Models, and Speech, beside a harness of the test's own. */
const besides = Layer.effectContext(
  Effect.map(Layer.build(fakes), Context.pick(HarnessHost, Models, Speech)),
);

/** What every computer's code Plugin shares: the Agent and Speech fakes, or `harness` in the Agent's place. */
export const agentEdges = (harness?: FakeHarness): Layer.Layer<AgentEdges> =>
  harness === undefined ? fakes : Layer.merge(harness.layer, besides);
