import type { ContextUsage, McpServerStatus } from '../../contract/index.js';
import type {
  McpServerConnectionStatus,
  McpServerStatus as CodexMcpServerStatus,
  RateLimitSnapshot,
  ThreadTokenUsage,
} from '../app-server/index.js';

const MCP_STATES: Record<McpServerConnectionStatus, McpServerStatus['status']> =
  {
    notStarted: 'pending',
    starting: 'pending',
    connected: 'connected',
    authenticationRequired: 'needs-auth',
    failed: 'failed',
    cancelled: 'failed',
    disabled: 'disabled',
  };

/** One MCP server as Codex reports it for a thread. */
export const toMcpStatus = (server: CodexMcpServerStatus): McpServerStatus => {
  const status =
    server.runtimeStatus === null
      ? server.authStatus === 'notLoggedIn'
        ? 'needs-auth'
        : 'pending'
      : MCP_STATES[server.runtimeStatus];
  const tools = Object.keys(server.tools).length;
  return {
    name: server.name,
    status,
    ...(server.toolsError === null ? {} : { error: server.toolsError }),
    ...(server.toolsError === null ? { tools } : {}),
  };
};

const HOUR_MINS = 60;
const DAY_MINS = 24 * HOUR_MINS;

/** A rate-limit window by its length: `5h`, `weekly`, `daily`. */
const windowLabel = (mins: number | null): string | undefined => {
  if (mins === null) return undefined;
  if (mins === 7 * DAY_MINS) return 'weekly';
  if (mins === DAY_MINS) return 'daily';
  if (mins % DAY_MINS === 0) return `${mins / DAY_MINS}d`;
  if (mins % HOUR_MINS === 0) return `${mins / HOUR_MINS}h`;
  return `${mins}m`;
};

const limits = (snapshot: RateLimitSnapshot): ContextUsage['rateLimits'] => {
  const name = snapshot.limitName ?? snapshot.limitId ?? 'codex';
  return [snapshot.primary, snapshot.secondary].flatMap((window) => {
    if (window === null) return [];
    const length = windowLabel(window.windowDurationMins);
    return [
      {
        label: length === undefined ? name : `${name} ${length}`,
        usedPercent: window.usedPercent,
        ...(window.resetsAt === null
          ? {}
          : { resetsAt: window.resetsAt * 1000 }),
      },
    ];
  });
};

/**
 * How full the context window is (the last request's tokens, as Codex
 * itself counts it) and every rate-limit window the account has.
 */
export const toContextUsage = (
  tokenUsage: ThreadTokenUsage | undefined,
  rateLimits: {
    readonly rateLimits: RateLimitSnapshot | null;
    readonly rateLimitsByLimitId: Readonly<
      Record<string, RateLimitSnapshot | undefined>
    > | null;
  },
): ContextUsage => {
  const snapshots =
    rateLimits.rateLimitsByLimitId === null
      ? [rateLimits.rateLimits ?? []].flat()
      : Object.values(rateLimits.rateLimitsByLimitId).filter(
          (snapshot) => snapshot !== undefined,
        );
  return {
    ...(tokenUsage === undefined
      ? {}
      : { usedTokens: tokenUsage.last.totalTokens }),
    ...(tokenUsage?.modelContextWindow == null
      ? {}
      : { maxTokens: tokenUsage.modelContextWindow }),
    rateLimits: snapshots.flatMap(limits),
  };
};
