import { Schema } from 'effect';

export const ClaudeModelUsageSchema = Schema.Struct({
  inputTokens: Schema.Number,
  outputTokens: Schema.Number,
  thinkingTokens: Schema.NullOr(Schema.Number),
  cacheReadInputTokens: Schema.Number,
  cacheCreationInputTokens: Schema.Number,
  webSearchRequests: Schema.Number,
  costUsd: Schema.Number,
  contextWindow: Schema.Number,
  maxOutputTokens: Schema.Number,
});

export const ClaudeContextUsageSchema = Schema.Struct({
  model: Schema.String,
  totalTokens: Schema.Number,
  maxTokens: Schema.Number,
  rawMaxTokens: Schema.Number,
  percentage: Schema.Number,
  categories: Schema.Array(
    Schema.Struct({
      name: Schema.String,
      tokens: Schema.Number,
      kind: Schema.Literals(['used', 'free', 'buffer', 'deferred']),
    }),
  ),
});

export const ClaudeRunFactsSchema = Schema.Struct({
  type: Schema.Literal('claude'),
  totalCostUsd: Schema.Number,
  durationMs: Schema.Number,
  apiDurationMs: Schema.Number,
  turns: Schema.Number,
  models: Schema.Record(Schema.String, ClaudeModelUsageSchema),
  context: Schema.NullOr(ClaudeContextUsageSchema),
});

export type ClaudeRunFacts = typeof ClaudeRunFactsSchema.Type;

const RateLimitWindowSchema = Schema.Struct({
  utilization: Schema.NullOr(Schema.Number),
  resetsAt: Schema.NullOr(Schema.String),
});

export const ClaudeAccountUsageSchema = Schema.Struct({
  subscriptionType: Schema.NullOr(Schema.String),
  rateLimitsAvailable: Schema.Boolean,
  rateLimits: Schema.NullOr(
    Schema.Struct({
      fiveHour: Schema.NullOr(RateLimitWindowSchema),
      sevenDay: Schema.NullOr(RateLimitWindowSchema),
      sevenDayOpus: Schema.NullOr(RateLimitWindowSchema),
      sevenDaySonnet: Schema.NullOr(RateLimitWindowSchema),
      modelScoped: Schema.Array(
        Schema.Struct({
          displayName: Schema.String,
          utilization: Schema.NullOr(Schema.Number),
          resetsAt: Schema.NullOr(Schema.String),
        }),
      ),
      extraUsage: Schema.NullOr(
        Schema.Struct({
          enabled: Schema.Boolean,
          monthlyLimit: Schema.NullOr(Schema.Number),
          usedCredits: Schema.NullOr(Schema.Number),
          utilization: Schema.NullOr(Schema.Number),
          currency: Schema.NullOr(Schema.String),
        }),
      ),
    }),
  ),
});

export type ClaudeAccountUsage = typeof ClaudeAccountUsageSchema.Type;
