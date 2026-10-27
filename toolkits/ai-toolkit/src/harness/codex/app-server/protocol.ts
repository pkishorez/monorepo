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

/** What one user message sends: text, images, and the Skills it names. */
export type UserInput =
  | UserInputText
  | { readonly type: 'image'; readonly url: string }
  | { readonly type: 'skill'; readonly name: string; readonly path: string };

export type SandboxPolicy =
  | { readonly type: 'dangerFullAccess' }
  | { readonly type: 'readOnly'; readonly networkAccess: boolean }
  | {
      readonly type: 'workspaceWrite';
      readonly writableRoots: ReadonlyArray<string>;
      readonly networkAccess: boolean;
      readonly excludeTmpdirEnvVar: boolean;
      readonly excludeSlashTmp: boolean;
    };

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
      /** The PTY process, when the command runs in one. */
      readonly processId?: string | null;
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
          | {
              readonly status: CollabAgentStatus;
              readonly message: string | null;
            }
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

export type CollabAgentStatus =
  | 'pendingInit'
  | 'running'
  | 'interrupted'
  | 'completed'
  | 'errored'
  | 'shutdown'
  | 'notFound';

export interface SkillMetadata {
  readonly name: string;
  readonly description: string;
  readonly shortDescription?: string;
  readonly interface?: { readonly shortDescription?: string };
  readonly path: string;
  readonly enabled: boolean;
}

/** A command still running in the background of a thread. */
export interface BackgroundTerminal {
  readonly itemId: string;
  readonly processId: string;
  readonly command: string;
}

export type McpServerConnectionStatus =
  | 'notStarted'
  | 'starting'
  | 'connected'
  | 'authenticationRequired'
  | 'failed'
  | 'cancelled'
  | 'disabled';

export interface McpServerStatus {
  readonly name: string;
  /** Null when no thread runtime is loaded for it. */
  readonly runtimeStatus: McpServerConnectionStatus | null;
  readonly tools: Readonly<Record<string, unknown>>;
  readonly toolsError: string | null;
  readonly authStatus:
    | 'unknown'
    | 'unsupported'
    | 'notLoggedIn'
    | 'bearerToken'
    | 'oAuth';
}

export interface RateLimitWindow {
  readonly usedPercent: number;
  readonly windowDurationMins: number | null;
  /** Unix seconds. */
  readonly resetsAt: number | null;
}

export interface RateLimitSnapshot {
  readonly limitId: string | null;
  readonly limitName: string | null;
  readonly primary: RateLimitWindow | null;
  readonly secondary: RateLimitWindow | null;
}

export interface ThreadTokenUsage {
  readonly total: TokenUsageBreakdown;
  readonly last: TokenUsageBreakdown;
  readonly modelContextWindow: number | null;
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
  readonly 'thread/fork': {
    readonly params: {
      readonly threadId: string;
      /** The last turn to keep, inclusive; omitted keeps every turn. */
      readonly lastTurnId?: string;
      readonly model?: string;
      readonly cwd: string;
      readonly sandbox?: SandboxMode;
      readonly approvalPolicy?: 'never';
      readonly developerInstructions?: string;
      readonly ephemeral: boolean;
      readonly excludeTurns: boolean;
    };
    readonly result: { readonly thread: { readonly id: string } };
  };
  readonly 'thread/unsubscribe': {
    readonly params: { readonly threadId: string };
    readonly result: unknown;
  };
  readonly 'thread/turns/list': {
    readonly params: {
      readonly threadId: string;
      readonly limit?: number;
      readonly sortDirection?: 'asc' | 'desc';
      readonly itemsView?: 'notLoaded' | 'summary' | 'full';
    };
    readonly result: {
      readonly data: ReadonlyArray<Turn>;
      readonly nextCursor: string | null;
    };
  };
  readonly 'thread/backgroundTerminals/list': {
    readonly params: { readonly threadId: string; readonly cursor?: string };
    readonly result: {
      readonly data: ReadonlyArray<BackgroundTerminal>;
      readonly nextCursor: string | null;
    };
  };
  readonly 'thread/backgroundTerminals/terminate': {
    readonly params: { readonly threadId: string; readonly processId: string };
    readonly result: { readonly terminated: boolean };
  };
  readonly 'skills/list': {
    readonly params: {
      readonly cwds: ReadonlyArray<string>;
      readonly forceReload?: boolean;
    };
    readonly result: {
      readonly data: ReadonlyArray<{
        readonly cwd: string;
        readonly skills: ReadonlyArray<SkillMetadata>;
      }>;
    };
  };
  readonly 'mcpServerStatus/list': {
    readonly params: {
      readonly threadId?: string;
      readonly detail: 'full' | 'toolsAndAuthOnly';
      readonly cursor?: string;
    };
    readonly result: {
      readonly data: ReadonlyArray<McpServerStatus>;
      readonly nextCursor: string | null;
    };
  };
  readonly 'account/rateLimits/read': {
    readonly params: { readonly excludeResetCreditDetails: boolean };
    readonly result: {
      readonly rateLimits: RateLimitSnapshot;
      readonly rateLimitsByLimitId: Readonly<
        Record<string, RateLimitSnapshot | undefined>
      > | null;
    };
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
      readonly input: ReadonlyArray<UserInput>;
      /** These three hold for this turn and the ones after it. */
      readonly model?: string;
      readonly effort?: ReasoningEffort;
      readonly sandboxPolicy?: SandboxPolicy;
      /** A JSON Schema the turn's final message must match. */
      readonly outputSchema?: unknown;
    };
    readonly result: { readonly turn: Turn };
  };
  readonly 'turn/steer': {
    readonly params: {
      readonly threadId: string;
      readonly expectedTurnId: string;
      readonly input: ReadonlyArray<UserInput>;
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

/** One question of an `item/tool/requestUserInput` request. */
export interface UserInputQuestion {
  readonly id: string;
  readonly header: string;
  readonly question: string;
  /** The user may type an answer of their own. */
  readonly isOther: boolean;
  readonly isSecret: boolean;
  /** None: the answer is typed. */
  readonly options: ReadonlyArray<{
    readonly label: string;
    readonly description: string;
  }> | null;
}

/** The questions the agent asks with its `request_user_input` tool. */
export interface UserInputRequest {
  readonly threadId: string;
  readonly turnId: string;
  readonly itemId: string;
  readonly questions: ReadonlyArray<UserInputQuestion>;
}

/** The answers to a `UserInputRequest`, by question id. */
export interface UserInputResponse {
  readonly answers: Readonly<
    Record<string, { readonly answers: ReadonlyArray<string> }>
  >;
}

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
    readonly tokenUsage: ThreadTokenUsage;
  };
  /** A request the server sent is settled: answered, or dropped by Codex. */
  readonly 'serverRequest/resolved': {
    readonly threadId: string;
    readonly requestId: number | string;
  };
  /** Skill files changed on disk: lists read before are stale. */
  readonly 'skills/changed': Readonly<Record<string, never>>;
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
