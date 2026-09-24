import { describe, expect, it } from 'vitest';
import { claude, common } from '../../runtime/protocol/index.js';
import type { Message } from '../../runtime/table/index.js';
import { toUiConversation, toUiMessages } from './message.js';

const COMMON_PARTS = common.parts;
const CLAUDE_PARTS = claude.parts;
let clock = 0;
const message = (
  id: string,
  role: Message['role'],
  parts: Message['data']['parts'],
  runId = 'run-1',
): Message => ({
  id,
  threadId: 'thread-1',
  runId,
  role,
  createdAt: ++clock,
  data: { parts, metadata: null },
});

describe('toUiMessages', () => {
  it('folds consecutive rows of one run and role and joins streamed text', () => {
    const turns = toUiMessages([
      message('u', 'user', [{ type: 'text', content: 'hi' }]),
      message('a1', 'assistant', [{ type: 'text', content: 'Hel' }]),
      message('a2', 'assistant', [
        { type: 'text', content: 'lo' },
        { type: 'thinking', content: 'a' },
      ]),
      message('a3', 'assistant', [{ type: 'thinking', content: 'b' }]),
      message('n', 'user', [{ type: 'text', content: 'next' }], 'run-2'),
    ]);

    expect(turns.map((turn) => [turn.id, turn.role, turn.parts])).toEqual([
      ['u', 'user', [{ type: 'text', content: 'hi' }]],
      [
        'a1',
        'assistant',
        [
          { type: 'text', content: 'Hello' },
          { type: 'thinking', content: 'ab' },
        ],
      ],
      ['n', 'user', [{ type: 'text', content: 'next' }]],
    ]);
  });
});

describe('toUiConversation', () => {
  it('combines a question tool call, answer, completion, and result', () => {
    const conversation = toUiConversation([
      message('call', 'assistant', [
        {
          type: 'tool-call',
          id: 'tool-1',
          name: 'AskUserQuestion',
          arguments: '{}',
          state: 'input-complete',
        },
      ]),
      message('question', 'assistant', [
        {
          type: 'custom',
          name: COMMON_PARTS.QUESTION,
          data: {
            requestId: 'request-1',
            toolCallId: 'tool-1',
            questions: [{ id: '0', prompt: 'Which option?' }],
          },
        },
      ]),
      message('answer', 'user', [
        {
          type: 'custom',
          name: CLAUDE_PARTS.PERMISSION_RESOLVED,
          data: {
            requestId: 'request-1',
            toolCallId: 'tool-1',
            answer: { behavior: 'answer', answers: { '0': ['One'] } },
          },
        },
      ]),
      message('result', 'assistant', [
        {
          type: 'tool-result',
          toolCallId: 'tool-1',
          content: 'answered',
          state: 'complete',
        },
      ]),
    ]);

    expect(conversation).toHaveLength(1);
    expect(conversation[0]?.parts).toEqual([
      {
        type: 'question-interaction',
        requestId: 'request-1',
        questions: [{ id: '0', prompt: 'Which option?' }],
        answers: { '0': ['One'] },
        resolved: true,
      },
    ]);
  });

  it('groups consecutive non-conversational records into one activity', () => {
    const conversation = toUiConversation([
      message('tool', 'assistant', [
        {
          type: 'tool-call',
          id: 'tool-1',
          name: 'Read',
          arguments: '{}',
          state: 'complete',
        },
      ]),
      message('file', 'assistant', [
        {
          type: 'custom',
          name: COMMON_PARTS.FILE_CHANGED,
          data: { path: 'README.md', operation: 'updated' },
        },
      ]),
    ]);

    expect(conversation).toHaveLength(1);
    expect(conversation[0]?.parts).toMatchObject([
      { type: 'activity', items: [{ type: 'tool-call' }, { type: 'custom' }] },
    ]);
  });
});
