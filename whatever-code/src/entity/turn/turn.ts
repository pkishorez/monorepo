import { EntityESchema } from "@std-toolkit/eschema";
import { Schema } from "effect";
import { TaskStatus } from "../status.js";

// ── Claude sub-schemas ───────────────────────────────────────────────

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
