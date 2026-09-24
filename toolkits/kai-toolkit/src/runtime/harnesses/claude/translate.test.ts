import type { SDKMessage } from '@anthropic-ai/claude-agent-sdk';
import { describe, expect, it } from 'vitest';
import { CLAUDE_PARTS } from '../../protocol/index.js';
import { recordingTranscript } from '../../transcript/index.js';
import { ClaudeTranslator } from './translate.js';

const assistant = (
  id: string,
  content: unknown[],
  parent: string | null = null,
) =>
  ({
    type: 'assistant',
    session_id: 'session',
    parent_tool_use_id: parent,
    message: { id, content },
  }) as unknown as SDKMessage;

describe('ClaudeTranslator', () => {
  it('reports the native session handle without writing a part', () => {
    const recorder = recordingTranscript();
    const translator = new ClaudeTranslator(recorder.writer);
    const signal = translator.apply({
      type: 'system',
      subtype: 'init',
      session_id: 'claude-session',
    } as unknown as SDKMessage);

    expect(signal).toEqual({ type: 'session', sessionId: 'claude-session' });
    expect(recorder.writes).toEqual([]);
  });

  it('writes streamed text once and takes tool calls from the final message', () => {
    const recorder = recordingTranscript();
    const translator = new ClaudeTranslator(recorder.writer);
    translator.apply({
      type: 'stream_event',
      event: { type: 'message_start', message: { id: 'm1' } },
    } as unknown as SDKMessage);
    translator.apply({
      type: 'stream_event',
      event: {
        type: 'content_block_delta',
        index: 0,
        delta: { type: 'text_delta', text: 'hel' },
      },
    } as unknown as SDKMessage);
    translator.apply({
      type: 'stream_event',
      event: {
        type: 'content_block_delta',
        index: 0,
        delta: { type: 'text_delta', text: 'lo' },
      },
    } as unknown as SDKMessage);
    translator.apply(
      assistant('m1', [
        { type: 'text', text: 'hello' },
        { type: 'tool_use', id: 'tool-1', name: 'Read', input: { path: 'x' } },
      ]),
    );

    expect(recorder.writes).toEqual([
      { method: 'text', delta: 'hel' },
      { method: 'text', delta: 'lo' },
      {
        method: 'toolCall',
        part: {
          id: 'tool-1',
          name: 'Read',
          arguments: '{"path":"x"}',
          input: { path: 'x' },
          state: 'input-complete',
        },
      },
    ]);
  });

  it('writes whole text blocks for messages that were never streamed', () => {
    const recorder = recordingTranscript();
    const translator = new ClaudeTranslator(recorder.writer);
    translator.apply(assistant('m2', [{ type: 'text', text: 'hello' }], 'p1'));

    expect(recorder.writes).toEqual([
      { method: 'text', delta: 'hello' },
      {
        method: 'part',
        part: {
          type: 'custom',
          name: CLAUDE_PARTS.SUBAGENT,
          data: { parentToolUseId: 'p1', messageId: 'm2' },
        },
      },
    ]);
  });

  it('turns the result message into the run outcome', () => {
    const translator = new ClaudeTranslator(recordingTranscript().writer);
    expect(
      translator.apply({
        type: 'result',
        subtype: 'error_during_execution',
        is_error: true,
        errors: ['boom'],
      } as unknown as SDKMessage),
    ).toEqual({ type: 'failed', message: 'boom' });
    expect(
      translator.apply({
        type: 'result',
        subtype: 'success',
        is_error: false,
      } as unknown as SDKMessage),
    ).toEqual({ type: 'completed' });
  });
});
