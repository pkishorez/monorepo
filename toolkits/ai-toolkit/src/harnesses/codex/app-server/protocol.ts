// The slice of the Codex app-server protocol this harness speaks, trimmed from
// `codex app-server generate-ts --experimental` (codex-cli 0.154.0). Fields
// this harness never reads are left out; regenerate and re-trim on upgrade.

export type ReasoningEffort = string;
export type SandboxMode =
  | 'read-only'
  | 'workspace-write'
  | 'danger-full-access';
export type TurnStatus = 'completed' | 'interrupted' | 'failed' | 'inProgress';

export interface UserInputText {
  readonly type: 'text';
  readonly text: string;
  readonly text_elements: ReadonlyArray<never>;
}

export interface TurnError {
  readonly message: string;
  readonly additionalDetails: string | null;
}

export interface Turn {
  readonly id: string;
  readonly items: ReadonlyArray<ThreadItem>;
  readonly status: TurnStatus;
  readonly error: TurnError | null;
}

export type PatchChangeKind =
  | { readonly type: 'add' }
  | { readonly type: 'delete' }
  | { readonly type: 'update'; readonly move_path: string | null };

export interface FileUpdateChange {
  readonly path: string;
  readonly kind: PatchChangeKind;
  readonly diff: string;
}

export type CollabAgentTool =
  | 'spawnAgent'
  | 'sendInput'
  | 'resumeAgent'
  | 'wait'
  | 'closeAgent'
  | 'sendMessage'
  | 'followupTask'
  | 'interruptAgent'
  | 'listAgents';

export type WebSearchAction =
  | { readonly type: 'search'; readonly query: string | null }
  | { readonly type: 'openPage'; readonly url: string | null }
  | { readonly type: 'findInPage'; readonly url: string | null }
  | { readonly type: 'other' };

export type ThreadItem =
  | {
      readonly type: 'userMessage';
      readonly id: string;
      readonly content: ReadonlyArray<{
        readonly type: string;
        readonly text?: string;
      }>;
    }
  | {
      readonly type: 'agentMessage';
      readonly id: string;
      readonly text: string;
      readonly phase: string | null;
    }
  | { readonly type: 'plan'; readonly id: string; readonly text: string }
  | {
      readonly type: 'reasoning';
      readonly id: string;
      readonly summary: ReadonlyArray<string>;
      readonly content: ReadonlyArray<string>;
    }
  | {
      readonly type: 'commandExecution';
      readonly id: string;
      readonly command: string;
      readonly cwd: string;
      readonly status: 'inProgress' | 'completed' | 'failed' | 'declined';
      readonly aggregatedOutput: string | null;
      readonly exitCode: number | null;
    }
  | {
      readonly type: 'fileChange';
      readonly id: string;
      readonly changes: ReadonlyArray<FileUpdateChange>;
      readonly status: 'inProgress' | 'completed' | 'failed' | 'declined';
    }
  | {
      readonly type: 'mcpToolCall';
      readonly id: string;
      readonly server: string;
      readonly tool: string;
      readonly status: 'inProgress' | 'completed' | 'failed';
      readonly arguments: unknown;
      readonly result: { readonly content: ReadonlyArray<unknown> } | null;
      readonly error: { readonly message: string } | null;
    }
  | {
      readonly type: 'dynamicToolCall';
      readonly id: string;
      readonly tool: string;
      readonly arguments: unknown;
      readonly status: 'inProgress' | 'completed' | 'failed';
      readonly contentItems: ReadonlyArray<unknown> | null;
      readonly success: boolean | null;
    }
  | {
      readonly type: 'collabAgentToolCall';
      readonly id: string;
      readonly tool: CollabAgentTool;
      readonly status: 'inProgress' | 'completed' | 'failed' | 'interrupted';
      readonly senderThreadId: string;
      readonly receiverThreadIds: ReadonlyArray<string>;
      readonly prompt: string | null;
      readonly model: string | null;
      readonly agentsStates: Readonly<
        Record<
          string,
          | { readonly status: string; readonly message: string | null }
          | undefined
        >
      >;
    }
  | {
      readonly type: 'webSearch';
      readonly id: string;
      readonly query: string;
      readonly action: WebSearchAction | null;
    }
  | { readonly type: 'imageView'; readonly id: string; readonly path: string }
  | { readonly type: 'imageGeneration'; readonly id: string }
  | { readonly type: 'contextCompaction'; readonly id: string }
  | {
      readonly type: 'enteredReviewMode';
      readonly id: string;
      readonly review: string;
    }
  | {
      readonly type: 'exitedReviewMode';
      readonly id: string;
      readonly review: string;
    };

export type ThreadItemType = ThreadItem['type'];

export interface TokenUsageBreakdown {
  readonly totalTokens: number;
  readonly inputTokens: number;
  readonly cachedInputTokens: number;
  readonly cacheWriteInputTokens: number;
  readonly outputTokens: number;
  readonly reasoningOutputTokens: number;
}

export interface Model {
  readonly id: string;
  readonly displayName: string;
  readonly hidden: boolean;
  readonly isDefault: boolean;
}

/** Client → server requests: params and result, by method. */
export interface Requests {
  readonly initialize: {
    readonly params: {
      readonly clientInfo: {
        readonly name: string;
        readonly title: string | null;
        readonly version: string;
      };
      readonly capabilities: {
        readonly experimentalApi: boolean;
        readonly requestAttestation: boolean;
        readonly optOutNotificationMethods?: ReadonlyArray<string>;
      };
    };
    readonly result: unknown;
  };
  readonly 'thread/start': {
    readonly params: {
      readonly model: string;
      readonly cwd: string;
      readonly sandbox: SandboxMode;
      readonly approvalPolicy: 'never';
      readonly ephemeral?: boolean;
      readonly developerInstructions?: string;
    };
    readonly result: { readonly thread: { readonly id: string } };
  };
  readonly 'thread/resume': {
    readonly params: {
      readonly threadId: string;
      readonly model: string;
      readonly cwd: string;
      readonly sandbox: SandboxMode;
      readonly approvalPolicy: 'never';
      readonly excludeTurns: boolean;
    };
    readonly result: { readonly thread: { readonly id: string } };
  };
  readonly 'turn/start': {
    readonly params: {
      readonly threadId: string;
      readonly input: ReadonlyArray<UserInputText>;
      readonly effort: ReasoningEffort;
    };
    readonly result: { readonly turn: Turn };
  };
  readonly 'turn/steer': {
    readonly params: {
      readonly threadId: string;
      readonly expectedTurnId: string;
      readonly input: ReadonlyArray<UserInputText>;
    };
    readonly result: { readonly turnId: string };
  };
  readonly 'turn/interrupt': {
    readonly params: { readonly threadId: string; readonly turnId: string };
    readonly result: unknown;
  };
  readonly 'model/list': {
    readonly params: {
      readonly includeHidden: boolean;
      readonly cursor?: string;
    };
    readonly result: {
      readonly data: ReadonlyArray<Model>;
      readonly nextCursor: string | null;
    };
  };
}
export type RequestMethod = keyof Requests;

/** Server → client notifications this harness reads, by method. */
export interface Notifications {
  readonly 'turn/started': { readonly threadId: string; readonly turn: Turn };
  readonly 'turn/completed': { readonly threadId: string; readonly turn: Turn };
  readonly 'item/started': {
    readonly threadId: string;
    readonly turnId: string;
    readonly item: ThreadItem;
  };
  readonly 'item/completed': {
    readonly threadId: string;
    readonly turnId: string;
    readonly item: ThreadItem;
  };
  readonly 'turn/plan/updated': {
    readonly threadId: string;
    readonly turnId: string;
    readonly explanation: string | null;
    readonly plan: ReadonlyArray<{
      readonly step: string;
      readonly status: string;
    }>;
  };
  readonly 'thread/tokenUsage/updated': {
    readonly threadId: string;
    readonly turnId: string;
    readonly tokenUsage: {
      readonly total: TokenUsageBreakdown;
      readonly last: TokenUsageBreakdown;
    };
  };
  readonly error: {
    readonly threadId: string;
    readonly turnId: string;
    readonly willRetry: boolean;
    readonly error: TurnError;
  };
  readonly 'item/agentMessage/delta': {
    readonly threadId: string;
    readonly turnId: string;
    readonly itemId: string;
    readonly delta: string;
  };
  readonly 'item/reasoning/summaryTextDelta': {
    readonly threadId: string;
    readonly turnId: string;
    readonly itemId: string;
    readonly delta: string;
    readonly summaryIndex: number;
  };
  readonly 'item/reasoning/textDelta': {
    readonly threadId: string;
    readonly turnId: string;
    readonly itemId: string;
    readonly delta: string;
    readonly contentIndex: number;
  };
}

/** Any notification the server sends, read or not. */
export interface Notification {
  readonly method: string;
  readonly params: unknown;
}

/** Narrows a notification to one of the methods this harness reads. */
export const isNotification = <M extends keyof Notifications>(
  notification: Notification,
  method: M,
): notification is { readonly method: M; readonly params: Notifications[M] } =>
  notification.method === method;

/**
 * Deltas this harness never reads; the server is asked not to send them.
 * Message and reasoning text deltas are read, to stream text in chunks.
 */
export const DELTA_METHODS = [
  'item/plan/delta',
  'item/reasoning/summaryPartAdded',
  'item/commandExecution/outputDelta',
  'item/fileChange/outputDelta',
  'command/exec/outputDelta',
  'process/outputDelta',
] as const;
