import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Schema } from 'effect';
import { CODEX_COMMAND } from '../../constants.js';
import type { CodexProtocol } from '../../protocol/index.js';
import { CodexAppServer } from './app-server.js';

const open = <const Fields extends Schema.Struct.Fields>(fields: Fields) =>
  Schema.StructWithRest(Schema.Struct(fields), [
    Schema.Record(Schema.String, Schema.Unknown),
  ]);

const WindowSchema = Schema.NullOr(
  open({
    usedPercent: Schema.Number,
    windowDurationMins: Schema.NullOr(Schema.Number),
    resetsAt: Schema.NullOr(Schema.Number),
  }),
);

const RateLimitSchema = open({
  limitId: Schema.NullOr(Schema.String),
  limitName: Schema.NullOr(Schema.String),
  planType: Schema.NullOr(Schema.String),
  primary: WindowSchema,
  secondary: WindowSchema,
});

const RateLimitsResponseSchema = open({
  ordinaryUsageAllowed: Schema.NullOr(Schema.Boolean),
  rateLimits: RateLimitSchema,
  rateLimitsByLimitId: Schema.NullOr(
    Schema.Record(Schema.String, RateLimitSchema),
  ),
  accountId: Schema.NullOr(Schema.String),
});

const integer = Schema.Union([Schema.String, Schema.Number]);
const UsageResponseSchema = open({
  summary: open({
    lifetimeTokens: Schema.NullOr(integer),
    peakDailyTokens: Schema.NullOr(integer),
    currentStreakDays: Schema.NullOr(integer),
    longestStreakDays: Schema.NullOr(integer),
  }),
  dailyUsageBuckets: Schema.NullOr(
    Schema.Array(open({ startDate: Schema.String, tokens: integer })),
  ),
});

const decodeRateLimits = Schema.decodeUnknownSync(RateLimitsResponseSchema);
const decodeUsage = Schema.decodeUnknownSync(UsageResponseSchema);

const window = (value: typeof WindowSchema.Type) =>
  value === null
    ? null
    : {
        usedPercent: value.usedPercent,
        windowDurationMinutes: value.windowDurationMins,
        resetsAt: value.resetsAt,
      };

const rateLimit = (value: typeof RateLimitSchema.Type) => ({
  limitId: value.limitId,
  limitName: value.limitName,
  planType: value.planType,
  primary: window(value.primary),
  secondary: window(value.secondary),
});

const integerString = (value: string | number | null): string | null =>
  value === null ? null : String(value);

export const readCodexAccountUsage = async (
  command: string = CODEX_COMMAND,
): Promise<CodexProtocol['AccountUsage']> => {
  const cwd = await mkdtemp(join(tmpdir(), 'ai-toolkit-codex-'));
  const server = new CodexAppServer(cwd, command);
  try {
    await server.initialize();
    const [rawLimits, rawUsage] = await Promise.all([
      server.request('account/rateLimits/read'),
      server.request('account/usage/read'),
    ]);
    const limits = decodeRateLimits(rawLimits);
    const usage = decodeUsage(rawUsage);
    return {
      accountId: limits.accountId,
      ordinaryUsageAllowed: limits.ordinaryUsageAllowed,
      rateLimits: rateLimit(limits.rateLimits),
      rateLimitsByLimitId: Object.fromEntries(
        Object.entries(limits.rateLimitsByLimitId ?? {}).map(([id, value]) => [
          id,
          rateLimit(value),
        ]),
      ),
      tokenHistory: {
        lifetimeTokens: integerString(usage.summary.lifetimeTokens),
        peakDailyTokens: integerString(usage.summary.peakDailyTokens),
        currentStreakDays: integerString(usage.summary.currentStreakDays),
        longestStreakDays: integerString(usage.summary.longestStreakDays),
        daily: (usage.dailyUsageBuckets ?? []).map((bucket) => ({
          startDate: bucket.startDate,
          tokens: String(bucket.tokens),
        })),
      },
    };
  } finally {
    server.close();
    await rm(cwd, { recursive: true, force: true });
  }
};
