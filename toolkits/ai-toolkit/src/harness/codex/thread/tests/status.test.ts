import { describe, expect, it } from 'vitest';
import type { McpServerStatus } from '../../app-server/index.js';
import { toContextUsage, toMcpStatus } from '../status.js';

const server = (overrides: Partial<McpServerStatus>): McpServerStatus => ({
  name: 'docs',
  runtimeStatus: 'connected',
  tools: { a: {}, b: {} },
  toolsError: null,
  authStatus: 'unsupported',
  ...overrides,
});

describe('toMcpStatus', () => {
  it('counts tools of a connected server', () => {
    expect(toMcpStatus(server({}))).toEqual({
      name: 'docs',
      status: 'connected',
      tools: 2,
    });
  });

  it('carries the error of a failed one', () => {
    expect(
      toMcpStatus(server({ runtimeStatus: 'failed', toolsError: 'boom' })),
    ).toEqual({ name: 'docs', status: 'failed', error: 'boom' });
  });

  it('reads auth when no runtime is loaded', () => {
    expect(
      toMcpStatus(server({ runtimeStatus: null, authStatus: 'notLoggedIn' }))
        .status,
    ).toBe('needs-auth');
    expect(
      toMcpStatus(server({ runtimeStatus: 'authenticationRequired' })).status,
    ).toBe('needs-auth');
  });
});

describe('toContextUsage', () => {
  const breakdown = (totalTokens: number) => ({
    totalTokens,
    inputTokens: 0,
    cachedInputTokens: 0,
    cacheWriteInputTokens: 0,
    outputTokens: 0,
    reasoningOutputTokens: 0,
  });

  it('uses the last request for the context and labels every window', () => {
    const snapshot = {
      limitId: 'codex',
      limitName: null,
      primary: { usedPercent: 7, windowDurationMins: 300, resetsAt: 100 },
      secondary: {
        usedPercent: 40,
        windowDurationMins: 10_080,
        resetsAt: null,
      },
    };
    expect(
      toContextUsage(
        {
          total: breakdown(90_000),
          last: breakdown(12_000),
          modelContextWindow: 258_000,
        },
        { rateLimits: snapshot, rateLimitsByLimitId: { codex: snapshot } },
      ),
    ).toEqual({
      usedTokens: 12_000,
      maxTokens: 258_000,
      rateLimits: [
        { label: 'codex 5h', usedPercent: 7, resetsAt: 100_000 },
        { label: 'codex weekly', usedPercent: 40 },
      ],
    });
  });

  it('has no token counts before a turn, nor limits for an API key', () => {
    expect(
      toContextUsage(undefined, {
        rateLimits: null,
        rateLimitsByLimitId: null,
      }),
    ).toEqual({ rateLimits: [] });
  });
});
