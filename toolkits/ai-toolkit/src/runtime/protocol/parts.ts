import type { UIMessage } from '@tanstack/ai';
import { Schema } from 'effect';
import { claude, type ClaudeProtocol } from './claude/index.js';
import { codex, type CodexProtocol } from './codex/index.js';
import type { AgentQuestion, NamedCustomPart } from './shared.js';

type ClaudePart = ClaudeProtocol['Part'];
type CodexPart = CodexProtocol['Part'];
const ClaudePartSchema = claude.schemas.part;
const CodexPartSchema = codex.schemas.part;

export const COMMON_PARTS = {
  ERROR: 'agent.error',
  PERMISSION_REQUEST: 'agent.permission.request',
  QUESTION: 'agent.question',
  FILE_CHANGED: 'agent.file.changed',
} as const;

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

type CustomPartData<Name extends AiCustomPart['name']> = Extract<
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

const customPartSchema = <Name extends string, A, I, R>(
  name: Name,
  data: Schema.Codec<A, I, R>,
) =>
  Schema.Struct({
    type: Schema.Literal('custom'),
    name: Schema.Literal(name),
    data,
  });

const CommonPartSchema = Schema.Union([
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
    COMMON_PARTS.QUESTION,
    Schema.Struct({
      requestId: Schema.String,
      toolCallId: Schema.optionalKey(Schema.String),
      questions: Schema.Array(
        Schema.Struct({
          id: Schema.String,
          prompt: Schema.String,
          choices: Schema.optionalKey(Schema.Array(Schema.String)),
        }),
      ),
    }),
  ),
  customPartSchema(
    COMMON_PARTS.FILE_CHANGED,
    Schema.Struct({
      path: Schema.String,
      operation: Schema.Literals(['created', 'updated', 'deleted']),
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
  CommonPartSchema,
  ClaudePartSchema,
  CodexPartSchema,
]);

export const AiMessagePartSchema: Schema.Codec<AiMessagePart, unknown> =
  StructuralMessagePartSchema;

export type { AgentQuestion, Answer } from './shared.js';
