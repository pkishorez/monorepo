import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { query } from '@anthropic-ai/claude-agent-sdk';
import type { ClaudeProtocol } from '../../protocol/index.js';

const window = (
  value:
    | { readonly utilization: number | null; readonly resets_at: string | null }
    | null
    | undefined,
) =>
  value === undefined || value === null
    ? null
    : { utilization: value.utilization, resetsAt: value.resets_at };

export const readClaudeAccountUsage = async (): Promise<
  ClaudeProtocol['AccountUsage']
> => {
  const cwd = await mkdtemp(join(tmpdir(), 'ai-toolkit-claude-'));
  const controller = new AbortController();
  const prompt: AsyncIterable<never> = {
    [Symbol.asyncIterator]: () => ({
      next: () =>
        new Promise<IteratorResult<never>>((resolve) => {
          controller.signal.addEventListener(
            'abort',
            () => resolve({ done: true, value: undefined as never }),
            { once: true },
          );
        }),
    }),
  };
  const live = query({
    prompt,
    options: {
      cwd,
      abortController: controller,
      persistSession: false,
      settingSources: ['user'],
    },
  });

  try {
    await live.initializationResult();
    const usage =
      await live.usage_EXPERIMENTAL_MAY_CHANGE_DO_NOT_RELY_ON_THIS_API_YET({
        skipBehaviors: true,
      });
    const limits = usage.rate_limits;
    return {
      subscriptionType: usage.subscription_type,
      rateLimitsAvailable: usage.rate_limits_available,
      rateLimits:
        limits === null
          ? null
          : {
              fiveHour: window(limits.five_hour),
              sevenDay: window(limits.seven_day),
              sevenDayOpus: window(limits.seven_day_opus),
              sevenDaySonnet: window(limits.seven_day_sonnet),
              modelScoped: (limits.model_scoped ?? []).map((model) => ({
                displayName: model.display_name,
                utilization: model.utilization,
                resetsAt: model.resets_at,
              })),
              extraUsage:
                limits.extra_usage === undefined || limits.extra_usage === null
                  ? null
                  : {
                      enabled: limits.extra_usage.is_enabled,
                      monthlyLimit: limits.extra_usage.monthly_limit,
                      usedCredits: limits.extra_usage.used_credits,
                      utilization: limits.extra_usage.utilization,
                      currency: limits.extra_usage.currency ?? null,
                    },
            },
    };
  } finally {
    controller.abort();
    live.close();
    await rm(cwd, { recursive: true, force: true });
  }
};
