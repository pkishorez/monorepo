import type { UIMessage } from '@tanstack/ai';
import { Schema } from 'effect';

export const COMMON_PARTS = {
  ERROR: 'agent.error',
  PERMISSION_REQUEST: 'agent.permission.request',
  PERMISSION_RESOLVED: 'agent.permission.resolved',
  QUESTION: 'agent.question',
  FILE_CHANGED: 'agent.file.changed',
} as const;

export const CLAUDE_PARTS = {
  SUBAGENT: 'claude.subagent',
  COMPACTION: 'claude.compaction',
} as const;

export const CODEX_PARTS = {
  PLAN: 'codex.plan',
  COMMAND: 'codex.command',
  MCP: 'codex.mcp',
  REQUEST_RESOLVED: 'codex.request.resolved',
} as const;

export const CUSTOM_PART_NAMES = [
  ...Object.values(COMMON_PARTS),
  ...Object.values(CLAUDE_PARTS),
  ...Object.values(CODEX_PARTS),
] as const;

export interface AgentQuestion {
  readonly id: string;
  readonly prompt: string;
  readonly choices?: ReadonlyArray<string>;
}

export type Answer =
  | { readonly behavior: 'allow'; readonly updatedInput?: unknown }
  | { readonly behavior: 'deny'; readonly message?: string };

export type ClaudeAnswer =
  | Answer
  | {
      readonly behavior: 'answer';
      readonly answers: Readonly<Record<string, ReadonlyArray<string>>>;
    };

export type CodexAnswer =
  | {
      readonly type: 'approval';
      readonly decision:
        | 'accept'
        | 'acceptForSession'
        | 'decline'
        | 'cancel'
        | {
            readonly acceptWithExecpolicyAmendment: {
              readonly execpolicy_amendment: ReadonlyArray<string>;
            };
          }
        | {
            readonly applyNetworkPolicyAmendment: {
              readonly network_policy_amendment: {
                readonly host: string;
                readonly action: 'allow' | 'deny';
              };
            };
          };
      readonly reason?: string;
    }
  | {
      readonly type: 'question';
      readonly answers: Readonly<Record<string, ReadonlyArray<string>>>;
    }
  | {
      readonly type: 'permissions';
      readonly permissions: {
        readonly network?: { readonly enabled: boolean | null };
        readonly fileSystem?: {
          readonly read: ReadonlyArray<string> | null;
          readonly write: ReadonlyArray<string> | null;
        };
      };
      readonly scope: 'turn' | 'session';
      readonly strictAutoReview?: boolean;
    }
  | {
      readonly type: 'elicitation';
      readonly action: 'accept' | 'decline' | 'cancel';
      readonly content: unknown;
      readonly metadata: unknown;
    };

interface NamedCustomPart<Name extends string, Data> {
  readonly type: 'custom';
  readonly name: Name;
  readonly data: Data;
}

export type CommonPart =
  | NamedCustomPart<typeof COMMON_PARTS.ERROR, { readonly message: string }>
  | NamedCustomPart<
      typeof COMMON_PARTS.PERMISSION_REQUEST,
      {
        readonly requestId: string;
        readonly toolCallId?: string;
        readonly toolName: string;
        readonly input: unknown;
        readonly title?: string;
      }
    >
  | NamedCustomPart<
      typeof COMMON_PARTS.PERMISSION_RESOLVED,
      {
        readonly requestId: string;
        readonly toolCallId?: string;
        readonly answer: ClaudeAnswer;
      }
    >
  | NamedCustomPart<
      typeof COMMON_PARTS.QUESTION,
      {
        readonly requestId: string;
        readonly toolCallId?: string;
        readonly questions: ReadonlyArray<AgentQuestion>;
      }
    >
  | NamedCustomPart<
      typeof COMMON_PARTS.FILE_CHANGED,
      {
        readonly path: string;
        readonly operation: 'created' | 'updated' | 'deleted';
      }
    >;

export type ClaudePart =
  | NamedCustomPart<
      typeof CLAUDE_PARTS.SUBAGENT,
      {
        readonly parentToolUseId: string;
        readonly messageId: string;
      }
    >
  | NamedCustomPart<
      typeof CLAUDE_PARTS.COMPACTION,
      { readonly status: string }
    >;

export type CodexPart =
  | NamedCustomPart<typeof CODEX_PARTS.PLAN, { readonly text: string }>
  | NamedCustomPart<typeof CODEX_PARTS.COMMAND, { readonly event: unknown }>
  | NamedCustomPart<typeof CODEX_PARTS.MCP, { readonly event: unknown }>
  | NamedCustomPart<
      typeof CODEX_PARTS.REQUEST_RESOLVED,
      { readonly requestId: string; readonly answer: CodexAnswer }
    >;

export type AiCustomPart = CommonPart | ClaudePart | CodexPart;

type PersistedPart<Part> = Part extends {
  readonly type: 'tool-result';
  readonly content: infer Content;
}
  ? Omit<Part, 'content'> & {
      readonly content: Content extends Array<infer Item>
        ? ReadonlyArray<Item>
        : Content;
    }
  : Part;

/** TanStack's UIMessage part union plus ai-toolkit's custom parts. */
export type AiMessagePart =
  | PersistedPart<UIMessage['parts'][number]>
  | AiCustomPart;

export type AiTextPart = Extract<AiMessagePart, { readonly type: 'text' }>;
export type AiThinkingPart = Extract<
  AiMessagePart,
  { readonly type: 'thinking' }
>;
export type AiToolCallPart = Extract<
  AiMessagePart,
  { readonly type: 'tool-call' }
>;
export type AiToolResultPart = Extract<
  AiMessagePart,
  { readonly type: 'tool-result' }
>;

export type CustomPartData<Name extends AiCustomPart['name']> = Extract<
  AiCustomPart,
  { readonly name: Name }
>['data'];

export const customPart = <Name extends AiCustomPart['name']>(
  name: Name,
  data: CustomPartData<Name>,
): NamedCustomPart<Name, CustomPartData<Name>> => ({
  type: 'custom',
  name,
  data,
});

export const AnswerSchema = Schema.Union([
  Schema.Struct({
    behavior: Schema.Literal('allow'),
    updatedInput: Schema.optionalKey(Schema.Unknown),
  }),
  Schema.Struct({
    behavior: Schema.Literal('deny'),
    message: Schema.optionalKey(Schema.String),
  }),
]);

export const ClaudeAnswerSchema = Schema.Union([
  AnswerSchema,
  Schema.Struct({
    behavior: Schema.Literal('answer'),
    answers: Schema.Record(Schema.String, Schema.Array(Schema.String)),
  }),
]);

export const CodexAnswerSchema = Schema.Union([
  Schema.Struct({
    type: Schema.Literal('approval'),
    decision: Schema.Union([
      Schema.Literals(['accept', 'acceptForSession', 'decline', 'cancel']),
      Schema.Struct({
        acceptWithExecpolicyAmendment: Schema.Struct({
          execpolicy_amendment: Schema.Array(Schema.String),
        }),
      }),
      Schema.Struct({
        applyNetworkPolicyAmendment: Schema.Struct({
          network_policy_amendment: Schema.Struct({
            host: Schema.String,
            action: Schema.Literals(['allow', 'deny']),
          }),
        }),
      }),
    ]),
    reason: Schema.optionalKey(Schema.String),
  }),
  Schema.Struct({
    type: Schema.Literal('question'),
    answers: Schema.Record(Schema.String, Schema.Array(Schema.String)),
  }),
  Schema.Struct({
    type: Schema.Literal('permissions'),
    permissions: Schema.Struct({
      network: Schema.optionalKey(
        Schema.Struct({ enabled: Schema.NullOr(Schema.Boolean) }),
      ),
      fileSystem: Schema.optionalKey(
        Schema.Struct({
          read: Schema.NullOr(Schema.Array(Schema.String)),
          write: Schema.NullOr(Schema.Array(Schema.String)),
        }),
      ),
    }),
    scope: Schema.Literals(['turn', 'session']),
    strictAutoReview: Schema.optionalKey(Schema.Boolean),
  }),
  Schema.Struct({
    type: Schema.Literal('elicitation'),
    action: Schema.Literals(['accept', 'decline', 'cancel']),
    content: Schema.Unknown,
    metadata: Schema.Unknown,
  }),
]);

const QuestionPayloadSchema = Schema.Struct({
  requestId: Schema.String,
  toolCallId: Schema.optionalKey(Schema.String),
  questions: Schema.Array(
    Schema.Struct({
      id: Schema.String,
      prompt: Schema.String,
      choices: Schema.optionalKey(Schema.Array(Schema.String)),
    }),
  ),
});

const customPartSchema = <Name extends AiCustomPart['name'], A, I, R>(
  name: Name,
  data: Schema.Codec<A, I, R>,
) =>
  Schema.Struct({
    type: Schema.Literal('custom'),
    name: Schema.Literal(name),
    data,
  });

const CustomPartSchema = Schema.Union([
  customPartSchema(
    COMMON_PARTS.ERROR,
    Schema.Struct({ message: Schema.String }),
  ),
  customPartSchema(
    COMMON_PARTS.PERMISSION_REQUEST,
    Schema.Struct({
      requestId: Schema.String,
      toolCallId: Schema.optionalKey(Schema.String),
      toolName: Schema.String,
      input: Schema.Unknown,
      title: Schema.optionalKey(Schema.String),
    }),
  ),
  customPartSchema(
    COMMON_PARTS.PERMISSION_RESOLVED,
    Schema.Struct({
      requestId: Schema.String,
      toolCallId: Schema.optionalKey(Schema.String),
      answer: ClaudeAnswerSchema,
    }),
  ),
  customPartSchema(COMMON_PARTS.QUESTION, QuestionPayloadSchema),
  customPartSchema(
    COMMON_PARTS.FILE_CHANGED,
    Schema.Struct({
      path: Schema.String,
      operation: Schema.Literals(['created', 'updated', 'deleted']),
    }),
  ),
  customPartSchema(
    CLAUDE_PARTS.SUBAGENT,
    Schema.Struct({
      parentToolUseId: Schema.String,
      messageId: Schema.String,
    }),
  ),
  customPartSchema(
    CLAUDE_PARTS.COMPACTION,
    Schema.Struct({ status: Schema.String }),
  ),
  customPartSchema(CODEX_PARTS.PLAN, Schema.Struct({ text: Schema.String })),
  customPartSchema(
    CODEX_PARTS.COMMAND,
    Schema.Struct({ event: Schema.Unknown }),
  ),
  customPartSchema(CODEX_PARTS.MCP, Schema.Struct({ event: Schema.Unknown })),
  customPartSchema(
    CODEX_PARTS.REQUEST_RESOLVED,
    Schema.Struct({
      requestId: Schema.String,
      answer: CodexAnswerSchema,
    }),
  ),
]);

const ContentSourceSchema = Schema.Union([
  Schema.Struct({
    type: Schema.Literal('data'),
    value: Schema.String,
    mimeType: Schema.String,
  }),
  Schema.Struct({
    type: Schema.Literal('url'),
    value: Schema.String,
    mimeType: Schema.optionalKey(Schema.String),
  }),
]);

const MediaPartSchema = <Type extends 'image' | 'audio' | 'video' | 'document'>(
  type: Type,
) =>
  Schema.Struct({
    type: Schema.Literal(type),
    source: ContentSourceSchema,
    metadata: Schema.optionalKey(Schema.Unknown),
  });

const StructuralMessagePartSchema = Schema.Union([
  Schema.Struct({
    type: Schema.Literal('text'),
    content: Schema.String,
    metadata: Schema.optionalKey(Schema.Unknown),
  }),
  MediaPartSchema('image'),
  MediaPartSchema('audio'),
  MediaPartSchema('video'),
  MediaPartSchema('document'),
  Schema.Struct({
    type: Schema.Literal('tool-call'),
    id: Schema.String,
    name: Schema.String,
    arguments: Schema.String,
    input: Schema.optionalKey(Schema.Unknown),
    state: Schema.Literals([
      'awaiting-input',
      'input-streaming',
      'input-complete',
      'approval-requested',
      'approval-responded',
      'complete',
      'error',
    ]),
    approval: Schema.optionalKey(
      Schema.Struct({
        id: Schema.String,
        needsApproval: Schema.Boolean,
        approved: Schema.optionalKey(Schema.Boolean),
      }),
    ),
    output: Schema.optionalKey(Schema.Unknown),
    metadata: Schema.optionalKey(Schema.Unknown),
  }),
  Schema.Struct({
    type: Schema.Literal('tool-result'),
    id: Schema.optionalKey(Schema.String),
    name: Schema.optionalKey(Schema.String),
    toolCallId: Schema.String,
    content: Schema.Union([
      Schema.String,
      Schema.Array(
        Schema.Union([
          Schema.Struct({
            type: Schema.Literal('text'),
            content: Schema.String,
            metadata: Schema.optionalKey(Schema.Unknown),
          }),
          MediaPartSchema('image'),
          MediaPartSchema('audio'),
          MediaPartSchema('video'),
          MediaPartSchema('document'),
        ]),
      ),
    ]),
    state: Schema.Literals(['streaming', 'complete', 'error']),
    error: Schema.optionalKey(Schema.String),
    metadata: Schema.optionalKey(Schema.Record(Schema.String, Schema.Unknown)),
  }),
  Schema.Struct({
    type: Schema.Literal('thinking'),
    content: Schema.String,
    stepId: Schema.optionalKey(Schema.String),
    signature: Schema.optionalKey(Schema.String),
  }),
  Schema.Struct({
    type: Schema.Literal('structured-output'),
    status: Schema.Literals(['streaming', 'complete', 'error']),
    partial: Schema.optionalKey(Schema.Unknown),
    data: Schema.optionalKey(Schema.Unknown),
    raw: Schema.String,
    reasoning: Schema.optionalKey(Schema.String),
    errorMessage: Schema.optionalKey(Schema.String),
  }),
  Schema.Struct({
    type: Schema.Literal('ui-resource'),
    resource: Schema.Struct({
      uri: Schema.String,
      mimeType: Schema.String,
      text: Schema.optionalKey(Schema.String),
      blob: Schema.optionalKey(Schema.String),
    }),
    serverId: Schema.optionalKey(Schema.String),
    toolCallId: Schema.String,
    toolName: Schema.String,
    meta: Schema.optionalKey(Schema.Record(Schema.String, Schema.Unknown)),
  }),
  CustomPartSchema,
]);

// Schema boundary: mirrors TanStack's closed part union and adds ai-toolkit's
// custom parts. parts.test.ts asserts the type stays assignable.
export const AiMessagePartSchema: Schema.Codec<AiMessagePart, unknown> =
  StructuralMessagePartSchema;
