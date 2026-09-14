import { EventType, type AdapterYieldChunk } from '@tanstack/ai';
import { Option, Schema } from 'effect';
import {
  CODEX_EVENTS,
  COMMON_EVENTS,
  customEvent,
} from '../run-state/index.js';

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
    params: open({ turn: open({ status: Schema.String }) }),
  }),
]);

const decodeCodexEvent = Schema.decodeUnknownOption(CodexEventSchema);

export interface CodexTranslationContext {
  readonly runId: string;
  readonly threadId: string;
}

export const translateCodexEvent = (
  event: unknown,
  context: CodexTranslationContext,
): ReadonlyArray<AdapterYieldChunk> => {
  const decoded = decodeCodexEvent(event);
  if (Option.isNone(decoded)) return [];
  const { method, params } = decoded.value;

  if (method === 'thread/started') {
    return [
      customEvent(COMMON_EVENTS.SESSION_ID, {
        sessionId: params.thread.id,
      }),
    ];
  }

  if (method === 'item/started') {
    const { item } = params;
    if (item.type === 'agentMessage') {
      return [
        {
          type: EventType.TEXT_MESSAGE_START,
          messageId: item.id,
          role: 'assistant',
          timestamp: Date.now(),
        },
      ];
    }
    if (item.type === 'reasoning') {
      return [
        {
          type: EventType.REASONING_START,
          messageId: item.id,
          timestamp: Date.now(),
        },
      ];
    }
    if (
      item.type === 'commandExecution' ||
      item.type === 'fileChange' ||
      item.type === 'mcpToolCall'
    ) {
      return [
        {
          type: EventType.TOOL_CALL_START,
          toolCallId: item.id,
          toolCallName:
            item.type === 'commandExecution'
              ? 'commandExecution'
              : item.type === 'fileChange'
                ? 'fileChange'
                : 'mcpToolCall',
          timestamp: Date.now(),
        },
        {
          type: EventType.TOOL_CALL_ARGS,
          toolCallId: item.id,
          delta: JSON.stringify(item),
          timestamp: Date.now(),
        },
      ];
    }
  }

  if (method === 'item/agentMessage/delta') {
    return [
      {
        type: EventType.TEXT_MESSAGE_CONTENT,
        messageId: params.itemId,
        delta: params.delta,
        timestamp: Date.now(),
      },
    ];
  }

  if (
    method === 'item/reasoning/textDelta' ||
    method === 'item/reasoning/summaryTextDelta'
  ) {
    return [
      {
        type: EventType.REASONING_MESSAGE_CONTENT,
        messageId: params.itemId,
        delta: params.delta,
        timestamp: Date.now(),
      },
    ];
  }

  if (method === 'item/completed') {
    const { item } = params;
    if (item.type === 'agentMessage') {
      return [
        {
          type: EventType.TEXT_MESSAGE_END,
          messageId: item.id,
          timestamp: Date.now(),
        },
      ];
    }
    if (item.type === 'reasoning') {
      return [
        {
          type: EventType.REASONING_END,
          messageId: item.id,
          timestamp: Date.now(),
        },
      ];
    }
    if (item?.type === 'commandExecution' || item?.type === 'fileChange') {
      const toolEvents: AdapterYieldChunk[] = [
        {
          type: EventType.TOOL_CALL_END,
          toolCallId: item.id,
          timestamp: Date.now(),
        },
        {
          type: EventType.TOOL_CALL_RESULT,
          messageId: `${item.id}:result`,
          toolCallId: item.id,
          content: JSON.stringify(item),
          timestamp: Date.now(),
        },
      ];
      return [
        ...toolEvents,
        customEvent(CODEX_EVENTS.COMMAND, { event: params }, item.id),
      ];
    }
    if (item.type === 'mcpToolCall') {
      const toolEvents: AdapterYieldChunk[] = [
        {
          type: EventType.TOOL_CALL_END,
          toolCallId: item.id,
          timestamp: Date.now(),
        },
        {
          type: EventType.TOOL_CALL_RESULT,
          messageId: `${item.id}:result`,
          toolCallId: item.id,
          content: JSON.stringify(item),
          timestamp: Date.now(),
        },
      ];
      return [
        ...toolEvents,
        customEvent(CODEX_EVENTS.MCP, { event: params }, item.id),
      ];
    }
  }

  if (method === 'turn/plan/updated') {
    return [
      customEvent(CODEX_EVENTS.PLAN, {
        text: params.explanation ?? '',
      }),
    ];
  }

  if (method === 'turn/completed') {
    const failed = params.turn.status === 'failed';
    return failed
      ? [
          {
            type: EventType.RUN_ERROR,
            runId: context.runId,
            threadId: context.threadId,
            message: 'Codex turn failed',
            timestamp: Date.now(),
          },
        ]
      : [
          {
            type: EventType.RUN_FINISHED,
            runId: context.runId,
            threadId: context.threadId,
            outcome: { type: 'success' },
            timestamp: Date.now(),
          },
        ];
  }

  return [];
};
