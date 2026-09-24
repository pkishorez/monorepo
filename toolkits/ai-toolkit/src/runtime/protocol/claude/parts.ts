import { Schema } from 'effect';
import { AnswerSchema, type Answer, type NamedCustomPart } from '../shared.js';

export const CLAUDE_PARTS = {
  PERMISSION_RESOLVED: 'agent.permission.resolved',
  SUBAGENT: 'claude.subagent',
  COMPACTION: 'claude.compaction',
} as const;

export type ClaudeAnswer =
  | Answer
  | {
      readonly behavior: 'answer';
      readonly answers: Readonly<Record<string, ReadonlyArray<string>>>;
    };

export const ClaudeAnswerSchema = Schema.Union([
  AnswerSchema,
  Schema.Struct({
    behavior: Schema.Literal('answer'),
    answers: Schema.Record(Schema.String, Schema.Array(Schema.String)),
  }),
]);

export type ClaudePart =
  | NamedCustomPart<
      typeof CLAUDE_PARTS.PERMISSION_RESOLVED,
      {
        readonly requestId: string;
        readonly toolCallId?: string;
        readonly answer: ClaudeAnswer;
      }
    >
  | NamedCustomPart<
      typeof CLAUDE_PARTS.SUBAGENT,
      { readonly parentToolUseId: string; readonly messageId: string }
    >
  | NamedCustomPart<
      typeof CLAUDE_PARTS.COMPACTION,
      { readonly status: string }
    >;

const customPartSchema = <Name extends string, A, I, R>(
  name: Name,
  data: Schema.Codec<A, I, R>,
) =>
  Schema.Struct({
    type: Schema.Literal('custom'),
    name: Schema.Literal(name),
    data,
  });

export const ClaudePartSchema = Schema.Union([
  customPartSchema(
    CLAUDE_PARTS.PERMISSION_RESOLVED,
    Schema.Struct({
      requestId: Schema.String,
      toolCallId: Schema.optionalKey(Schema.String),
      answer: ClaudeAnswerSchema,
    }),
  ),
  customPartSchema(
    CLAUDE_PARTS.SUBAGENT,
    Schema.Struct({ parentToolUseId: Schema.String, messageId: Schema.String }),
  ),
  customPartSchema(
    CLAUDE_PARTS.COMPACTION,
    Schema.Struct({ status: Schema.String }),
  ),
]);
