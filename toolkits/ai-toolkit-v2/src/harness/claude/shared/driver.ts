import type {
  deleteSession,
  getSessionInfo,
  getSessionMessages,
  getSubagentMessages,
  listSessions,
  listSubagents,
  Options,
  Query,
  renameSession,
  SDKMessage,
  SDKUserMessage,
  tagSession,
} from '@anthropic-ai/claude-agent-sdk';
import { Context, type Effect, type Scope, type Stream } from 'effect';
import type { ClaudeError } from '../contract/index.js';

export type Control = Pick<
  Query,
  | 'initializationResult'
  | 'getContextUsage'
  | 'mcpServerStatus'
  | 'setModel'
  | 'setPermissionMode'
  | 'applyFlagSettings'
> & {
  readonly interrupt: () => Promise<unknown>;
};

export interface Connection {
  readonly messages: Stream.Stream<SDKMessage, ClaudeError>;
  readonly write: (message: SDKUserMessage) => void;
  readonly control: Control;
}

export interface Sessions {
  readonly listSessions: typeof listSessions;
  readonly getSessionInfo: typeof getSessionInfo;
  readonly getSessionMessages: typeof getSessionMessages;
  readonly listSubagents: typeof listSubagents;
  readonly getSubagentMessages: typeof getSubagentMessages;
  readonly renameSession: typeof renameSession;
  readonly tagSession: typeof tagSession;
  readonly deleteSession: typeof deleteSession;
}

export interface Driver {
  readonly open: (
    options: Options,
  ) => Effect.Effect<Connection, ClaudeError, Scope.Scope>;
  readonly sessions: Sessions;
}

export class ClaudeDriver extends Context.Service<ClaudeDriver, Driver>()(
  '@kestack/ai-toolkit-v2/ClaudeDriver',
) {}
