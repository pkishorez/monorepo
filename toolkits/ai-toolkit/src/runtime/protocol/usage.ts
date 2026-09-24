import { Schema } from 'effect';
import { claude, type ClaudeProtocol } from './claude/index.js';
import { codex, type CodexProtocol } from './codex/index.js';

const ClaudeRunFactsSchema = claude.schemas.runFacts;
const CodexRunFactsSchema = codex.schemas.runFacts;
type ClaudeRunFacts = ClaudeProtocol['RunFacts'];
type CodexRunFacts = CodexProtocol['RunFacts'];

export const RunFactsSchema = Schema.Union([
  ClaudeRunFactsSchema,
  CodexRunFactsSchema,
]);

export type RunFacts = ClaudeRunFacts | CodexRunFacts;
