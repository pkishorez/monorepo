import * as Parts from './parts.js';
import * as State from './state.js';
import * as Usage from './usage.js';

export const claude = {
  models: State.CLAUDE_MODELS,
  parts: Parts.CLAUDE_PARTS,
  schemas: {
    accountUsage: Usage.ClaudeAccountUsageSchema,
    answer: Parts.ClaudeAnswerSchema,
    contextUsage: Usage.ClaudeContextUsageSchema,
    modelUsage: Usage.ClaudeModelUsageSchema,
    part: Parts.ClaudePartSchema,
    runFacts: Usage.ClaudeRunFactsSchema,
  },
} as const;

export type ClaudeProtocol = {
  AccountUsage: Usage.ClaudeAccountUsage;
  Answer: Parts.ClaudeAnswer;
  Part: Parts.ClaudePart;
  RunFacts: Usage.ClaudeRunFacts;
  RunInput: State.ClaudeRunInput;
};
