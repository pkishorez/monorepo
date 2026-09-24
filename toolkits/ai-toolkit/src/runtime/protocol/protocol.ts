import * as Parts from './parts.js';
import * as Shared from './shared.js';
import * as State from './state.js';
import * as Usage from './usage.js';
import { claude, type ClaudeProtocol } from './claude/index.js';
import { codex, type CodexProtocol } from './codex/index.js';

export const common = {
  activeRunStatuses: State.ACTIVE_RUN_STATUSES,
  activeThreadStatuses: State.ACTIVE_THREAD_STATUSES,
  harnessIds: State.HARNESS_IDS,
  runStatuses: State.RUN_STATUSES,
  threadStatuses: State.THREAD_STATUSES,
  parts: Parts.COMMON_PARTS,
  partNames: [
    ...Object.values(Parts.COMMON_PARTS),
    ...Object.values(claude.parts),
    ...Object.values(codex.parts),
  ],
  customPart: Parts.customPart,
  schemas: {
    aiError: State.AiErrorSchema,
    messagePart: Parts.AiMessagePartSchema,
    answer: Shared.AnswerSchema,
    runFacts: Usage.RunFactsSchema,
    userTurn: State.UserTurnSchema,
  },
  errors: {
    HarnessFailed: State.HarnessFailed,
    RequestNotFound: State.RequestNotFound,
    RunConflict: State.RunConflict,
    RunNotFound: State.RunNotFound,
    ThreadBusy: State.ThreadBusy,
    ThreadNotFound: State.ThreadNotFound,
  },
} as const;

export type CommonProtocol = {
  AgentQuestion: Shared.AgentQuestion;
  AiCustomPart: Parts.AiCustomPart;
  AiError: State.AiError;
  AiMessagePart: Parts.AiMessagePart;
  AiTextPart: Parts.AiTextPart;
  AiThinkingPart: Parts.AiThinkingPart;
  AiToolCallPart: Parts.AiToolCallPart;
  AiToolResultPart: Parts.AiToolResultPart;
  Answer: Shared.Answer;
  CommonPart: Parts.CommonPart;
  HarnessFailed: State.HarnessFailed;
  HarnessContext: State.HarnessContext;
  HarnessId: State.HarnessId;
  RunFacts: Usage.RunFacts;
  ThreadNotFound: State.ThreadNotFound;
  RunOutcome: State.RunOutcome;
  RunStatus: State.RunStatus;
  StartInput: State.StartInput;
  ThreadStatus: State.ThreadStatus;
  TranscriptWriter: State.TranscriptWriter;
  UserTurn: State.UserTurn;
};

export { claude, codex };
export type { ClaudeProtocol, CodexProtocol };
