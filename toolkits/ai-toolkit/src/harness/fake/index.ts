import type { Runtime, Snapshot } from '@kestack/kabuki';
// Named in the declarations of the Actor this file exports.
import type {} from '@kestack/kabuki/types';
import { AGENT_CONTROLS, AgentFake } from './actor.js';
import { agentOver } from './serve.js';

/*
 * `@kestack/ai-toolkit/harness/fake`: the Agent fake, Claude Code and
 * Codex as one computer has them, as a Fake the Fake World runs. Both
 * start installed and signed in, in their own config folders, with their
 * models from the real catalog. Every reply replays a Turn recorded from
 * the real harness (recordings/), one at random unless its one Control
 * pins one. `serve` gives `Harnesses`, `OneShotPrompt`, `HarnessHost` and
 * `Models`, what connect's code Plugin asks for besides Speech;
 * `agentOver(runtime, { home, paceMs })` names another home, or another
 * pace. Browser-safe: nothing here imports Node.
 *
 * `kept` is the Snapshot a reload keeps: the world, without what ran in
 * it. Agents and replies die with the page, as they die with a computer's
 * restart.
 *
 * `makeFakeHarness` is the older fake for tests, driven Turn by Turn.
 */

const kept = (
  snapshot: Snapshot<typeof AgentFake>,
): Snapshot<typeof AgentFake> => ({
  ...snapshot,
  root: {
    ...snapshot.root,
    model: {
      ...snapshot.root.model,
      agents: [],
      replies: [],
    },
  },
});

export const agent = {
  name: 'Agent',
  actor: AgentFake,
  controls: AGENT_CONTROLS,
  serve: (runtime: Runtime<typeof AgentFake>) => agentOver(runtime),
  kept,
};

export {
  AGENT_CONTROLS,
  AgentFake,
  blank,
  type AgentMessage,
  type AgentModel,
  type Reply,
} from './actor.js';
export { agentOver, type AgentEdges, type AgentOptions } from './serve.js';
export {
  RECORDING_NAMES,
  RECORDINGS,
  type Recording,
  type RecordingName,
} from './recordings/index.js';
export {
  FAKE_SKILLS,
  makeFakeHarness,
  type FakeHarness,
} from './fake-harness.js';
