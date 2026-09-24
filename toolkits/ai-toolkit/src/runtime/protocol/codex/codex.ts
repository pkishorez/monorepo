import * as Parts from './parts.js';
import * as State from './state.js';
import * as Usage from './usage.js';

export const codex = {
  models: State.CODEX_MODELS,
  parts: Parts.CODEX_PARTS,
  schemas: {
    accountUsage: Usage.CodexAccountUsageSchema,
    answer: Parts.CodexAnswerSchema,
    part: Parts.CodexPartSchema,
    runFacts: Usage.CodexRunFactsSchema,
    threadCost: Usage.CodexThreadCostSchema,
    threadTokenUsage: Usage.CodexThreadTokenUsageSchema,
    tokenUsageBreakdown: Usage.TokenUsageBreakdownSchema,
  },
} as const;

export type CodexProtocol = {
  AccountUsage: Usage.CodexAccountUsage;
  Answer: Parts.CodexAnswer;
  Part: Parts.CodexPart;
  RunFacts: Usage.CodexRunFacts;
  RunInput: State.CodexRunInput;
};
