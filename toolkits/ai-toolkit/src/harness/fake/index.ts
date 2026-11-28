/*
 * `@kestack/ai-toolkit/harness/fake`: the Agent fake, Claude Code and
 * Codex as one computer has them, for a FakeWorld. Both start installed
 * and signed in, in their own config folders, with their models from the
 * real catalog. Every reply replays a Turn recorded from the real harness
 * (recordings/), one at random unless its one control pins one. Its state
 * shows the Agents open, each on its model and settings, and the replies
 * running. `agent({ home, paceMs })` gives `Harnesses`, `OneShotPrompt`,
 * `HarnessHost` and `Models`, what connect's code Plugin asks for besides
 * Speech, under another home or at another pace. Browser-safe: nothing
 * here imports Node.
 *
 * `makeFakeHarness` is the older fake for tests, driven Turn by Turn.
 */

export { agent } from './agent.js';
export { FAKE_SKILLS, makeFakeHarness } from './fake-harness.js';

export type { AgentState } from './agent.js';
export type { AgentOptions } from './layer.js';
export type { FakeHarness } from './fake-harness.js';
