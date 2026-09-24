import { Schema } from 'effect';

export const TokenUsageBreakdownSchema = Schema.Struct({
  totalTokens: Schema.Number,
  inputTokens: Schema.Number,
  cachedInputTokens: Schema.Number,
  cacheWriteInputTokens: Schema.Number,
  outputTokens: Schema.Number,
  reasoningOutputTokens: Schema.Number,
});

export const CodexThreadTokenUsageSchema = Schema.Struct({
  total: TokenUsageBreakdownSchema,
  last: TokenUsageBreakdownSchema,
  modelContextWindow: Schema.NullOr(Schema.Number),
});

export const CodexThreadCostSchema = Schema.Struct({
  estimatedUsageCreditsMicros: Schema.String,
  estimatedUsageUsdMicros: Schema.NullOr(Schema.String),
});

export const CodexRunFactsSchema = Schema.Struct({
  type: Schema.Literal('codex'),
  tokenUsage: Schema.NullOr(CodexThreadTokenUsageSchema),
  threadCost: Schema.NullOr(CodexThreadCostSchema),
});

export type CodexRunFacts = typeof CodexRunFactsSchema.Type;

const RateLimitWindowSchema = Schema.Struct({
  usedPercent: Schema.Number,
  windowDurationMinutes: Schema.NullOr(Schema.Number),
  resetsAt: Schema.NullOr(Schema.Number),
});

const RateLimitSchema = Schema.Struct({
  limitId: Schema.NullOr(Schema.String),
  limitName: Schema.NullOr(Schema.String),
  planType: Schema.NullOr(Schema.String),
  primary: Schema.NullOr(RateLimitWindowSchema),
  secondary: Schema.NullOr(RateLimitWindowSchema),
});

export const CodexAccountUsageSchema = Schema.Struct({
  accountId: Schema.NullOr(Schema.String),
  ordinaryUsageAllowed: Schema.NullOr(Schema.Boolean),
  rateLimits: RateLimitSchema,
  rateLimitsByLimitId: Schema.Record(Schema.String, RateLimitSchema),
  tokenHistory: Schema.Struct({
    lifetimeTokens: Schema.NullOr(Schema.String),
    peakDailyTokens: Schema.NullOr(Schema.String),
    currentStreakDays: Schema.NullOr(Schema.String),
    longestStreakDays: Schema.NullOr(Schema.String),
    daily: Schema.Array(
      Schema.Struct({ startDate: Schema.String, tokens: Schema.String }),
    ),
  }),
});

export type CodexAccountUsage = typeof CodexAccountUsageSchema.Type;
