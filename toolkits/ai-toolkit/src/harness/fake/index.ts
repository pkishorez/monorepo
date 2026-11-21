import type { Runtime, Snapshot } from '@kestack/kabuki';
// Named in the declarations of the Actor this file exports.
import type {} from '@kestack/kabuki/types';
import { AGENT_CONTROLS, AgentFake } from './actor.js';
import { agentOver } from './serve.js';

/*
 * `@kestack/ai-toolkit/harness/fake`: the Agent fake, Claude Code and
 * Codex as one computer has them, as a Fake the Fake World runs. Its Actor
 * starts with both installed and signed in, every reply an echo; its
 * Controls make the world (installs, logins, binaries, config folders,
 * Skills, models), pick the Script every reply plays, act on a running
 * reply, start a Turn of the agent's own, end Background Jobs, and set the
 * next Title, Btw answer and Context Usage. `serve` gives `Harnesses`,
 * `OneShotPrompt`, `HarnessHost` and `Models`, what connect's code Plugin
 * asks for besides Speech; `agentOver(runtime, { home })` names another
 * home. Browser-safe: nothing here imports Node.
 *
 * `kept` is the Snapshot a reload keeps: the world, without what ran in
 * it. Agents, replies, Background Jobs and wakeups die with the page, as
 * they die with a computer's restart.
 *
 * `makeFakeHarness` is the older fake for tests, scripted Turn by Turn.
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
      jobs: [],
      wakeups: [],
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
  type Now,
  type Reply,
} from './actor.js';
export { agentOver, type AgentEdges, type AgentOptions } from './serve.js';
export {
  SCRIPT_NAMES,
  SCRIPTS,
  type Ending,
  type Script,
  type ScriptName,
  type Step,
} from './scripts.js';
export {
  FAKE_SKILLS,
  makeFakeHarness,
  type FakeHarness,
} from './fake-harness.js';
