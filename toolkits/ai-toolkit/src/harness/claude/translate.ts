import type { SDKMessage } from '@anthropic-ai/claude-agent-sdk';
import { EventType, type AdapterYieldChunk } from '@tanstack/ai';
import {
  CLAUDE_EVENTS,
  COMMON_EVENTS,
  customEvent,
} from '../run-state/index.js';

export interface ClaudeTranslationContext {
  readonly runId: string;
  readonly threadId: string;
}

export const translateClaudeMessage = (
  event: SDKMessage,
  context: ClaudeTranslationContext,
): ReadonlyArray<AdapterYieldChunk> => {
  if (event.type === 'system' && event.subtype === 'init') {
    return [
      customEvent(COMMON_EVENTS.SESSION_ID, { sessionId: event.session_id }),
      ...event.skills.map((skill) =>
        customEvent(CLAUDE_EVENTS.SKILL_LOAD, { skill }),
      ),
    ];
  }

  if (event.type === 'system' && event.subtype === 'compact_boundary') {
    return [
      customEvent(CLAUDE_EVENTS.COMPACTION, {
        status: event.compact_metadata.trigger,
      }),
    ];
  }

  if (event.type === 'system' && event.subtype === 'files_persisted') {
    return event.files.map((file) =>
      customEvent(COMMON_EVENTS.FILE_CHANGED, {
        path: file.filename,
        operation: 'updated',
      }),
    );
  }

  if (event.type === 'system' && event.subtype === 'status') {
    if (event.status === 'compacting' || event.compact_result !== undefined) {
      return [
        customEvent(CLAUDE_EVENTS.COMPACTION, {
          status: event.status ?? event.compact_result ?? 'finished',
        }),
      ];
    }
    return [];
  }

  if (event.type === 'assistant') {
    const output: AdapterYieldChunk[] = [];
    for (const [index, block] of event.message.content.entries()) {
      const messageId = `${event.message.id}:${index}`;
      if (block.type === 'text') {
        output.push(
          {
            type: EventType.TEXT_MESSAGE_START,
            messageId,
            role: 'assistant',
            timestamp: Date.now(),
          },
          {
            type: EventType.TEXT_MESSAGE_CONTENT,
            messageId,
            delta: block.text,
            timestamp: Date.now(),
          },
          {
            type: EventType.TEXT_MESSAGE_END,
            messageId,
            timestamp: Date.now(),
          },
        );
      } else if (block.type === 'thinking') {
        output.push(
          {
            type: EventType.REASONING_START,
            messageId,
            timestamp: Date.now(),
          },
          {
            type: EventType.REASONING_MESSAGE_CONTENT,
            messageId,
            delta: block.thinking,
            timestamp: Date.now(),
          },
          {
            type: EventType.REASONING_END,
            messageId,
            timestamp: Date.now(),
          },
        );
      } else if (block.type === 'tool_use') {
        output.push(
          {
            type: EventType.TOOL_CALL_START,
            toolCallId: block.id,
            toolCallName: block.name,
            parentMessageId: messageId,
            timestamp: Date.now(),
          },
          {
            type: EventType.TOOL_CALL_ARGS,
            toolCallId: block.id,
            delta: JSON.stringify(block.input),
            timestamp: Date.now(),
          },
          {
            type: EventType.TOOL_CALL_END,
            toolCallId: block.id,
            timestamp: Date.now(),
          },
        );
      }
    }
    if (event.parent_tool_use_id !== null) {
      output.push(
        customEvent(
          CLAUDE_EVENTS.SUBAGENT,
          {
            event: {
              parentToolUseId: event.parent_tool_use_id,
              messageId: event.message.id,
            },
          },
          `${event.message.id}:subagent`,
        ),
      );
    }
    return output;
  }

  if (event.type === 'user' && Array.isArray(event.message.content)) {
    return event.message.content.flatMap((block, index) => {
      if (block.type !== 'tool_result') return [];
      return [
        {
          type: EventType.TOOL_CALL_RESULT,
          messageId: `${event.uuid ?? block.tool_use_id}:result:${index}`,
          toolCallId: block.tool_use_id,
          content:
            typeof block.content === 'string'
              ? block.content
              : JSON.stringify(block.content ?? ''),
          timestamp: Date.now(),
        },
      ];
    });
  }

  if (event.type === 'result') {
    if (event.is_error) {
      const message =
        event.subtype === 'success'
          ? event.result
          : event.errors.join('\n') || event.subtype;
      return [
        {
          type: EventType.RUN_ERROR,
          runId: context.runId,
          threadId: context.threadId,
          message,
          timestamp: Date.now(),
        },
      ];
    }
    return [
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
