import { Schema } from 'effect';
import { StdTable } from 'std-toolkit/db';
import type {
  AccessPatternDefinition,
  GlobalSecondaryIndex,
  KeyedEntity,
  PrimaryIndex,
  StdTable as StdTableType,
} from 'std-toolkit/db';
import { EntityESchema } from 'std-toolkit/eschema';
import { AiMessagePartSchema } from '../run-state/index.js';

const ThreadDataSchema = Schema.Union([
  Schema.Struct({
    type: Schema.Literal('claude'),
    sessionId: Schema.NullOr(Schema.String),
  }),
  Schema.Struct({
    type: Schema.Literal('codex'),
    threadId: Schema.NullOr(Schema.String),
  }),
]);

const ClaudeRunDataSchema = Schema.Struct({
  type: Schema.Literal('claude'),
  model: Schema.String,
  thinking: Schema.NullOr(Schema.Struct({ budgetTokens: Schema.Number })),
  permissionMode: Schema.String,
  allowDangerouslySkipPermissions: Schema.Boolean,
  maxTurns: Schema.NullOr(Schema.Number),
  permissionTimeoutMs: Schema.NullOr(Schema.Number),
  inputHash: Schema.String,
});

const CodexRunDataSchema = Schema.Struct({
  type: Schema.Literal('codex'),
  model: Schema.String,
  reasoningEffort: Schema.NullOr(Schema.String),
  approvalPolicy: Schema.String,
  sandbox: Schema.String,
  requestTimeoutMs: Schema.NullOr(Schema.Number),
  inputHash: Schema.String,
});

export const ThreadSchema = EntityESchema.make('AiThread', 'id', {
  harness: Schema.Literals(['claude', 'codex']),
  cwd: Schema.String,
  data: ThreadDataSchema,
}).build();

export const RunSchema = EntityESchema.make('AiRun', 'id', {
  threadId: Schema.String,
  harness: Schema.Literals(['claude', 'codex']),
  status: Schema.Literals([
    'running',
    'waiting',
    'completed',
    'failed',
    'cancelled',
  ]),
  startedAt: Schema.Number,
  finishedAt: Schema.NullOr(Schema.Number),
  data: Schema.Union([ClaudeRunDataSchema, CodexRunDataSchema]),
}).build();

export const MessageSchema = EntityESchema.make('AiMessage', 'id', {
  threadId: Schema.String,
  runId: Schema.String,
  role: Schema.Literals(['system', 'user', 'assistant']),
  createdAt: Schema.Number,
  data: Schema.Struct({
    parts: Schema.Array(AiMessagePartSchema),
    metadata: Schema.NullOr(Schema.Unknown),
  }),
}).build();

type AiTable = StdTableType<
  'ai-toolkit',
  PrimaryIndex<'pk', 'sk'>,
  {},
  { GSI1: GlobalSecondaryIndex<'GSI1', 'GSI1PK', 'GSI1SK'> }
>;

type UpdatedEntity<Schema extends typeof ThreadSchema> = KeyedEntity<
  'ai-toolkit',
  Schema,
  readonly [],
  {
    primary: AccessPatternDefinition<
      undefined,
      'primary',
      readonly [],
      readonly ['id']
    >;
    byUpdate: AccessPatternDefinition<
      'GSI1',
      'gsi',
      readonly [],
      readonly ['_u']
    >;
  }
>;

type ThreadUpdatedEntity<Schema extends typeof RunSchema> = KeyedEntity<
  'ai-toolkit',
  Schema,
  readonly ['threadId'],
  {
    primary: AccessPatternDefinition<
      undefined,
      'primary',
      readonly ['threadId'],
      readonly ['id']
    >;
    byThreadUpdate: AccessPatternDefinition<
      'GSI1',
      'gsi',
      readonly ['threadId'],
      readonly ['_u']
    >;
  }
>;

type MessageEntity = KeyedEntity<
  'ai-toolkit',
  typeof MessageSchema,
  readonly ['runId'],
  {
    primary: AccessPatternDefinition<
      undefined,
      'primary',
      readonly ['runId'],
      readonly ['id']
    >;
    byThreadUpdate: AccessPatternDefinition<
      'GSI1',
      'gsi',
      readonly ['threadId'],
      readonly ['_u']
    >;
  }
>;

export const aiTable: AiTable = StdTable.make('ai-toolkit')
  .primary('pk', 'sk')
  .gsi('GSI1', 'GSI1PK', 'GSI1SK')
  .build();

export const threads: UpdatedEntity<typeof ThreadSchema> = aiTable
  .entity(ThreadSchema)
  .primary()
  .index('GSI1', 'byUpdate', { pk: [], sk: ['_u'] })
  .build();

export const runs: ThreadUpdatedEntity<typeof RunSchema> = aiTable
  .entity(RunSchema)
  .primary({ pk: ['threadId'] })
  .index('GSI1', 'byThreadUpdate', { pk: ['threadId'], sk: ['_u'] })
  .build();

export const messages: MessageEntity = aiTable
  .entity(MessageSchema)
  .primary({ pk: ['runId'] })
  .index('GSI1', 'byThreadUpdate', { pk: ['threadId'], sk: ['_u'] })
  .build();

export type Thread = typeof ThreadSchema.Type;
export type Run = typeof RunSchema.Type;
export type Message = typeof MessageSchema.Type;
