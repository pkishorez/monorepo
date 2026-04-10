import { EntityESchema } from "@std-toolkit/eschema";
import { Schema } from "effect";
import { TaskStatus } from "../status.js";

// ── Claude sub-schemas ───────────────────────────────────────────────

export const QuestionOption = Schema.Struct({
  label: Schema.String,
  description: Schema.String,
});

export const QuestionItem = Schema.Struct({
  question: Schema.String,
  header: Schema.String,
  options: Schema.Array(QuestionOption),
  multiSelect: Schema.Boolean,
});

export const AskUserQuestionInput = Schema.Struct({
  questions: Schema.Array(QuestionItem),
});

export const PendingQuestionEntry = Schema.Struct({
  status: Schema.Literal("pending", "answered"),
  /** Typed tool input from AskUserQuestion. */
  question: AskUserQuestionInput,
  /** The user's response, populated when status transitions to "answered". */
  response: Schema.optionalWith(
    Schema.Record({ key: Schema.String, value: Schema.Unknown }),
    { exact: true },
  ),
});

export const ModelUsageEntry = Schema.Struct({
  inputTokens: Schema.Number,
  outputTokens: Schema.Number,
  cacheReadInputTokens: Schema.optionalWith(Schema.Number, {
    exact: true,
    default: () => 0,
  }),
  contextWindow: Schema.optionalWith(Schema.NullOr(Schema.Number), {
    exact: true,
    default: () => null,
  }),
});

export const ModelUsage = Schema.Record({
  key: Schema.String,
  value: ModelUsageEntry,
});

export const ClaudeTurnPayload = Schema.Struct({
  type: Schema.Literal("claude"),
  model: Schema.NullOr(Schema.String),
  costUsd: Schema.NullOr(Schema.Number),
  isError: Schema.NullOr(Schema.Boolean),
  modelUsage: Schema.NullOr(ModelUsage),
  /** Input tokens from the final API call — represents the actual context
   *  window usage for this turn.  `modelUsage` entries are cumulative across
   *  all API calls (tool-use loops), so they over-count for display purposes. */
  lastInputTokens: Schema.optionalWith(Schema.NullOr(Schema.Number), {
    exact: true,
    default: () => null,
  }),
  cwd: Schema.optionalWith(Schema.NullOr(Schema.String), {
    exact: true,
    default: () => null,
  }),
  resultSubtype: Schema.optionalWith(Schema.NullOr(Schema.String), {
    exact: true,
    default: () => null,
  }),
  resultErrors: Schema.optionalWith(
    Schema.NullOr(Schema.Array(Schema.String)),
    { exact: true, default: () => null },
  ),
  /** Questions awaiting user input, keyed by toolUseId. */
  pendingQuestions: Schema.optionalWith(
    Schema.Record({ key: Schema.String, value: PendingQuestionEntry }),
    { exact: true, default: () => ({}) },
  ),
});

// ── Codex sub-schemas ────────────────────────────────────────────────

export const TokenUsageBreakdown = Schema.Struct({
  totalTokens: Schema.Number,
  inputTokens: Schema.Number,
  cachedInputTokens: Schema.Number,
  outputTokens: Schema.Number,
  reasoningOutputTokens: Schema.Number,
});

export const ThreadTokenUsage = Schema.Struct({
  total: TokenUsageBreakdown,
  last: TokenUsageBreakdown,
  modelContextWindow: Schema.NullOr(Schema.Number),
});

export const TurnError = Schema.Struct({
  message: Schema.String,
  codexErrorInfo: Schema.NullOr(Schema.Unknown),
  additionalDetails: Schema.NullOr(Schema.String),
});

export const CodexTurnPayload = Schema.Struct({
  type: Schema.Literal("codex"),
  model: Schema.String,
  sdkTurnId: Schema.NullOr(Schema.String),
  usage: Schema.NullOr(ThreadTokenUsage),
  error: Schema.NullOr(TurnError),
});

// ── Unified turn ─────────────────────────────────────────────────────

export const TurnPayload = Schema.Union(ClaudeTurnPayload, CodexTurnPayload);

export const turnEntity = EntityESchema.make("turn", "id", {
  type: Schema.Literal("claude", "codex"),
  sessionId: Schema.String,
  status: TaskStatus,
  payload: TurnPayload,
}).build();
