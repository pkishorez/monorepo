import { describe, expect, it } from 'vitest';
import { COMMON_EVENTS } from '../run-state/index.js';
import { translateCodexEvent } from './translate.js';

describe('translateCodexEvent', () => {
  it('maps streamed assistant text', () => {
    const chunks = translateCodexEvent(
      {
        method: 'item/agentMessage/delta',
        params: { itemId: 'item-1', delta: 'hello' },
      },
      { runId: 'r1', threadId: 't1' },
    );

    expect(chunks).toMatchObject([
      {
        type: 'TEXT_MESSAGE_CONTENT',
        messageId: 'item-1',
        delta: 'hello',
      },
    ]);
  });

  it('maps the Codex thread as the native resume handle', () => {
    const chunks = translateCodexEvent(
      {
        method: 'thread/started',
        params: { thread: { id: 'codex-thread' } },
      },
      { runId: 'r1', threadId: 't1' },
    );

    expect(chunks).toMatchObject([
      {
        type: 'CUSTOM',
        name: COMMON_EVENTS.SESSION_ID,
        value: { sessionId: 'codex-thread' },
      },
    ]);
  });
});
