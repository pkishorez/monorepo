import type { SDKMessage } from '@anthropic-ai/claude-agent-sdk';
import {
  CLAUDE_PARTS,
  COMMON_PARTS,
  customPart,
  type RunOutcome,
  type TranscriptWriter,
} from '../../protocol/index.js';

export type ClaudeSignal =
  | { readonly type: 'session'; readonly sessionId: string }
  | RunOutcome;

const stringify = (value: unknown): string => {
  if (typeof value === 'string') return value;
  return JSON.stringify(value ?? '');
};

/**
 * Writes one Claude Agent SDK message into the Transcript. Text and thinking
 * arrive as stream deltas; the completed assistant message then contributes
 * only its tool calls, unless its content was never streamed.
 */
export class ClaudeTranslator {
  readonly #streamed = new Set<string>();

  constructor(private readonly transcript: TranscriptWriter) {}

  apply(event: SDKMessage): ClaudeSignal | undefined {
    switch (event.type) {
      case 'stream_event':
        return this.#stream(event.event);
      case 'assistant':
        return this.#assistant(event);
      case 'user':
        return this.#user(event);
      case 'system':
        return this.#system(event);
      case 'result':
        if (event.is_error) {
          return {
            type: 'failed',
            message:
              event.subtype === 'success'
                ? event.result
                : event.errors.join('\n') || event.subtype,
          };
        }
        return { type: 'completed' };
      default:
        return undefined;
    }
  }

  #stream(
    event: Extract<SDKMessage, { type: 'stream_event' }>['event'],
  ): undefined {
    if (event.type === 'message_start') {
      this.#streamed.add(event.message.id);
      return;
    }
    if (event.type !== 'content_block_delta') return;
    if (event.delta.type === 'text_delta') {
      this.transcript.text(event.delta.text);
    } else if (event.delta.type === 'thinking_delta') {
      this.transcript.thinking(event.delta.thinking);
    }
  }

  #assistant(event: Extract<SDKMessage, { type: 'assistant' }>): undefined {
    const streamed = this.#streamed.has(event.message.id);
    for (const block of event.message.content) {
      if (block.type === 'text') {
        if (!streamed) this.transcript.text(block.text);
      } else if (block.type === 'thinking') {
        if (!streamed) {
          this.transcript.thinkingPart({
            content: block.thinking,
            signature: block.signature,
          });
        }
      } else if (block.type === 'tool_use') {
        this.transcript.toolCall({
          id: block.id,
          name: block.name,
          arguments: JSON.stringify(block.input),
          input: block.input,
          state: 'input-complete',
        });
      }
    }
    if (event.parent_tool_use_id !== null) {
      this.transcript.part(
        customPart(CLAUDE_PARTS.SUBAGENT, {
          parentToolUseId: event.parent_tool_use_id,
          messageId: event.message.id,
        }),
      );
    }
  }

  #user(event: Extract<SDKMessage, { type: 'user' }>): undefined {
    if (!Array.isArray(event.message.content)) return;
    for (const block of event.message.content) {
      if (block.type !== 'tool_result') continue;
      this.transcript.toolResult({
        toolCallId: block.tool_use_id,
        content: stringify(block.content),
        state: block.is_error === true ? 'error' : 'complete',
      });
    }
  }

  #system(
    event: Extract<SDKMessage, { type: 'system' }>,
  ): ClaudeSignal | undefined {
    if (event.subtype === 'init') {
      return { type: 'session', sessionId: event.session_id };
    }
    if (event.subtype === 'compact_boundary') {
      this.transcript.part(
        customPart(CLAUDE_PARTS.COMPACTION, {
          status: event.compact_metadata.trigger,
        }),
      );
      return;
    }
    if (event.subtype === 'files_persisted') {
      for (const file of event.files) {
        this.transcript.part(
          customPart(COMMON_PARTS.FILE_CHANGED, {
            path: file.filename,
            operation: 'updated',
          }),
        );
      }
      return;
    }
    if (
      event.subtype === 'status' &&
      (event.status === 'compacting' || event.compact_result !== undefined)
    ) {
      this.transcript.part(
        customPart(CLAUDE_PARTS.COMPACTION, {
          status: event.status ?? event.compact_result ?? 'finished',
        }),
      );
    }
    return;
  }
}
