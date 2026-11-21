/*
 * `@kestack/ai-toolkit/harness/node`: what runs only on Node, as it starts
 * processes and reads files and the environment: Claude Code, Codex, and
 * the catalog's Node parts. Everything a browser runs too is
 * `@kestack/ai-toolkit/harness`.
 */

export {
  checkBinary,
  configFolderOf,
  modelsLayer,
  type ModelsOptions,
} from './catalog/index.js';
export { claude } from './claude/index.js';
export { codex, codexOneShot } from './codex/index.js';
