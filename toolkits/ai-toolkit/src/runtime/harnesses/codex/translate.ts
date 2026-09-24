import { Option, Schema } from 'effect';
import {
  codex,
  common,
  type CodexProtocol,
  type CommonProtocol,
} from '../../protocol/index.js';

const CODEX_PARTS = codex.parts;
const customPart = common.customPart;
type RunOutcome = CommonProtocol['RunOutcome'];
type CodexRunFacts = CodexProtocol['RunFacts'];
type TranscriptWriter = CommonProtocol['TranscriptWriter'];

const open = <const Fields extends Schema.Struct.Fields>(fields: Fields) =>
  Schema.StructWithRest(Schema.Struct(fields), [
    Schema.Record(Schema.String, Schema.Unknown),
  ]);

const CodexItemSchema = open({
  id: Schema.String,
  type: Schema.Literals([
    'agentMessage',
    'reasoning',
    'commandExecution',
    'fileChange',
    'mcpToolCall',
  ]),
});

const CodexEventSchema = Schema.Union([
  open({
    method: Schema.Literal('thread/tokenUsage/updated'),
    params: open({
      tokenUsage: open({
        total: open({
          totalTokens: Schema.Number,
          inputTokens: Schema.Number,
          cachedInputTokens: Schema.Number,
          cacheWriteInputTokens: Schema.Number,
          outputTokens: Schema.Number,
          reasoningOutputTokens: Schema.Number,
        }),
        last: open({
          totalTokens: Schema.Number,
          inputTokens: Schema.Number,
          cachedInputTokens: Schema.Number,
          cacheWriteInputTokens: Schema.Number,
          outputTokens: Schema.Number,
          reasoningOutputTokens: Schema.Number,
        }),
        modelContextWindow: Schema.NullOr(Schema.Number),
      }),
    }),
  }),
  open({
    method: Schema.Literal('thread/started'),
    params: open({ thread: open({ id: Schema.String }) }),
  }),
  open({
    method: Schema.Literals(['item/started', 'item/completed']),
    params: open({ item: CodexItemSchema }),
  }),
  open({
    method: Schema.Literals([
      'item/agentMessage/delta',
      'item/reasoning/textDelta',
      'item/reasoning/summaryTextDelta',
    ]),
    params: open({ itemId: Schema.String, delta: Schema.String }),
  }),
  open({
    method: Schema.Literal('turn/plan/updated'),
    params: open({ explanation: Schema.optional(Schema.String) }),
  }),
  open({
    method: Schema.Literal('turn/completed'),
    params: open({
      turn: open({
        status: Schema.String,
        error: Schema.optional(Schema.NullOr(open({ message: Schema.String }))),
      }),
    }),
  }),
]);

const decodeCodexEvent = Schema.decodeUnknownOption(CodexEventSchema);
const decodeNestedError = Schema.decodeUnknownOption(
  Schema.Struct({ error: Schema.Struct({ message: Schema.String }) }),
);

const readableError = (message: string): string => {
  try {
    const decoded = decodeNestedError(JSON.parse(message));
    return Option.isSome(decoded) ? decoded.value.error.message : message;
  } catch {
    return message;
  }
};

export type CodexSignal =
  | { readonly type: 'session'; readonly sessionId: string }
  | {
      readonly type: 'usage';
      readonly usage: NonNullable<CodexRunFacts['tokenUsage']>;
    }
  | RunOutcome;

/** Writes one Codex app-server notification into the Transcript. */
export const applyCodexEvent = (
  event: unknown,
  transcript: TranscriptWriter,
): CodexSignal | undefined => {
  const decoded = decodeCodexEvent(event);
  if (Option.isNone(decoded)) return undefined;
  const { method, params } = decoded.value;

  if (method === 'thread/started') {
    return { type: 'session', sessionId: params.thread.id };
  }

  if (method === 'thread/tokenUsage/updated') {
    return { type: 'usage', usage: params.tokenUsage };
  }

  if (method === 'item/started') {
    const { item } = params;
    if (
      item.type === 'commandExecution' ||
      item.type === 'fileChange' ||
      item.type === 'mcpToolCall'
    ) {
      transcript.toolCall({
        id: item.id,
        name: item.type,
        arguments: JSON.stringify(item),
        input: item,
        state: 'input-complete',
      });
    }
    return undefined;
  }

  if (method === 'item/agentMessage/delta') {
    transcript.text(params.delta);
    return undefined;
  }

  if (
    method === 'item/reasoning/textDelta' ||
    method === 'item/reasoning/summaryTextDelta'
  ) {
    transcript.thinking(params.delta);
    return undefined;
  }

  if (method === 'item/completed') {
    const { item } = params;
    if (item.type === 'commandExecution' || item.type === 'fileChange') {
      transcript.toolResult({
        toolCallId: item.id,
        content: JSON.stringify(item),
        state: 'complete',
      });
      transcript.part(customPart(CODEX_PARTS.COMMAND, { event: params }));
    } else if (item.type === 'mcpToolCall') {
      transcript.toolResult({
        toolCallId: item.id,
        content: JSON.stringify(item),
        state: 'complete',
      });
      transcript.part(customPart(CODEX_PARTS.MCP, { event: params }));
    }
    return undefined;
  }

  if (method === 'turn/plan/updated') {
    transcript.part(
      customPart(CODEX_PARTS.PLAN, { text: params.explanation ?? '' }),
    );
    return undefined;
  }

  if (method === 'turn/completed') {
    if (params.turn.status === 'failed') {
      return {
        type: 'failed',
        message:
          params.turn.error === undefined || params.turn.error === null
            ? 'Codex turn failed'
            : readableError(params.turn.error.message),
        facts: null,
      };
    }
    return { type: 'completed', facts: null };
  }

  return undefined;
};
