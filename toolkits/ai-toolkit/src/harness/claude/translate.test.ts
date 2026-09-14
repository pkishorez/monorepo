import type { SDKMessage } from '@anthropic-ai/claude-agent-sdk';
import { describe, expect, it } from 'vitest';
import { COMMON_EVENTS } from '../run-state/index.js';
import { translateClaudeMessage } from './translate.js';

describe('translateClaudeMessage', () => {
  it('maps the native session handle', () => {
    const fixture = {
      type: 'system',
      subtype: 'init',
      session_id: 'claude-session',
      skills: [],
    } as unknown as SDKMessage;

    expect(
      translateClaudeMessage(fixture, { runId: 'r1', threadId: 't1' }),
    ).toMatchObject([
      {
        type: 'CUSTOM',
        name: COMMON_EVENTS.SESSION_ID,
        value: { sessionId: 'claude-session' },
      },
    ]);
  });

  it('maps a completed text block to AG-UI', () => {
    const fixture = {
      type: 'assistant',
      session_id: 'session',
      parent_tool_use_id: null,
      message: {
        id: 'message',
        content: [{ type: 'text', text: 'hello' }],
      },
    } as unknown as SDKMessage;

    expect(
      translateClaudeMessage(fixture, { runId: 'r1', threadId: 't1' }).map(
        (chunk) => chunk.type,
      ),
    ).toEqual([
      'TEXT_MESSAGE_START',
      'TEXT_MESSAGE_CONTENT',
      'TEXT_MESSAGE_END',
    ]);
  });
});
