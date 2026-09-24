import { describe, expect, it } from 'vitest';
import { codex } from '../../protocol/index.js';
import { recordingTranscript } from '../../transcript/index.js';
import { applyCodexEvent } from './translate.js';

const CODEX_PARTS = codex.parts;

describe('applyCodexEvent', () => {
  it('writes streamed assistant text and reasoning', () => {
    const recorder = recordingTranscript();
    applyCodexEvent(
      {
        method: 'item/agentMessage/delta',
        params: { itemId: 'item-1', delta: 'hello' },
      },
      recorder.writer,
    );
    applyCodexEvent(
      {
        method: 'item/reasoning/textDelta',
        params: { itemId: 'item-2', delta: 'hmm' },
      },
      recorder.writer,
    );

    expect(recorder.writes).toEqual([
      { method: 'text', delta: 'hello' },
      { method: 'thinking', delta: 'hmm' },
    ]);
  });

  it('reports the Codex thread as the native resume handle', () => {
    expect(
      applyCodexEvent(
        {
          method: 'thread/started',
          params: { thread: { id: 'codex-thread' } },
        },
        recordingTranscript().writer,
      ),
    ).toEqual({ type: 'session', sessionId: 'codex-thread' });
  });

  it('reports the latest Run and Thread token snapshot', () => {
    const usage = {
      total: {
        totalTokens: 30,
        inputTokens: 20,
        cachedInputTokens: 5,
        cacheWriteInputTokens: 0,
        outputTokens: 10,
        reasoningOutputTokens: 4,
      },
      last: {
        totalTokens: 12,
        inputTokens: 8,
        cachedInputTokens: 2,
        cacheWriteInputTokens: 0,
        outputTokens: 4,
        reasoningOutputTokens: 1,
      },
      modelContextWindow: 200_000,
    };

    expect(
      applyCodexEvent(
        { method: 'thread/tokenUsage/updated', params: { tokenUsage: usage } },
        recordingTranscript().writer,
      ),
    ).toEqual({ type: 'usage', usage });
  });

  it('records a command as a tool call, then its result and event', () => {
    const recorder = recordingTranscript();
    const item = { id: 'cmd-1', type: 'commandExecution', command: 'ls' };
    applyCodexEvent(
      { method: 'item/started', params: { item } },
      recorder.writer,
    );
    applyCodexEvent(
      { method: 'item/completed', params: { item } },
      recorder.writer,
    );

    expect(recorder.writes.map((write) => write.method)).toEqual([
      'toolCall',
      'toolResult',
      'part',
    ]);
    expect(recorder.writes[2]).toMatchObject({
      part: { name: CODEX_PARTS.COMMAND },
    });
  });

  it('preserves the concrete Codex failure message', () => {
    expect(
      applyCodexEvent(
        {
          method: 'turn/completed',
          params: {
            turn: {
              status: 'failed',
              error: {
                message: JSON.stringify({
                  error: { message: 'This model is not supported' },
                }),
              },
            },
          },
        },
        recordingTranscript().writer,
      ),
    ).toEqual({
      type: 'failed',
      message: 'This model is not supported',
      facts: null,
    });
  });
});
