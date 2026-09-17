import { describe, expect, it } from 'vitest';
import { CODEX_PARTS } from '../../protocol/index.js';
import { recordingTranscript } from '../../transcript/index.js';
import { applyCodexEvent } from './translate.js';

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
    ).toEqual({ type: 'failed', message: 'This model is not supported' });
  });
});
