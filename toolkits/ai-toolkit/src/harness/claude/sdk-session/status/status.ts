import type { Query } from '@anthropic-ai/claude-agent-sdk';
import { Effect } from 'effect';
import {
  HarnessError,
  type ContextUsage,
  type McpServerStatus,
} from '../../../contract/index.js';
import { toRateLimits } from './rate-limits.js';

const ask = <A>(what: string, run: () => Promise<A>) =>
  Effect.tryPromise({
    try: run,
    catch: (cause) =>
      new HarnessError({
        message: `Claude Code did not report ${what}`,
        cause,
      }),
  });

/** Each MCP server the session knows, and how many tools it offers. */
export const mcpStatus = (
  live: Query,
): Effect.Effect<ReadonlyArray<McpServerStatus>, HarnessError> =>
  ask('its MCP servers', () => live.mcpServerStatus()).pipe(
    Effect.map((servers) =>
      servers.map((server) => ({
        name: server.name,
        status: server.status,
        ...(server.error === undefined ? {} : { error: server.error }),
        ...(server.tools === undefined ? {} : { tools: server.tools.length }),
      })),
    ),
  );

/**
 * The plan's rate limits, through the SDK's experimental usage request.
 * It is marked unstable, so a failure leaves the list empty rather than
 * failing the whole Context Usage.
 */
const rateLimits = (live: Query) =>
  ask('its rate limits', () =>
    live.usage_EXPERIMENTAL_MAY_CHANGE_DO_NOT_RELY_ON_THIS_API_YET({
      skipBehaviors: true,
    }),
  ).pipe(
    Effect.map((usage) => toRateLimits(usage.rate_limits)),
    Effect.orElseSucceed(() => []),
  );

/**
 * How full the context window is, from the last response's usage and local
 * estimates (no token-count calls), and the plan's rate limits.
 */
export const contextUsage = (
  live: Query,
): Effect.Effect<ContextUsage, HarnessError> =>
  Effect.all(
    [
      ask('its context usage', () =>
        live.getContextUsage({ detail: 'summary' }),
      ),
      rateLimits(live),
    ],
    { concurrency: 'unbounded' },
  ).pipe(
    Effect.map(([context, limits]) => ({
      usedTokens: context.totalTokens,
      maxTokens: context.maxTokens,
      rateLimits: limits,
    })),
  );
