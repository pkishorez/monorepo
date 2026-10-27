import { describe, expect, it } from 'vitest';
import type { Part } from '@kestack/connect/code';
import type { Row } from '../../../turns/rows/index.ts';
import { grouped } from '../parse.ts';
import { askedOf } from '../question.ts';

/*
 * An Agent Question's call as the transcript reads it, from what each
 * harness really records: Claude's `AskUserQuestion` with its answers as
 * `"question"="answer"` pairs, or its declined error; Codex's
 * `request_user_input`, its answers as `Header: a, b` lines, a secret's as
 * "(hidden)", or "Not answered" as an error. It is never folded into a
 * run of calls.
 */

type Call = Extract<Part, { readonly type: 'toolCall' }>;

const call = (name: string, input: Call['input']): Call => ({
  type: 'toolCall',
  id: name,
  tool: 'question',
  name,
  title: '',
  input,
});

const result = (output: string, isError = false) => ({ output, isError });

const claude = call('AskUserQuestion', {
  questions: [
    {
      header: 'Colour',
      question: 'Which "colour"?',
      options: [{ label: 'Red', description: '' }],
      multiSelect: false,
    },
    {
      header: 'Fruits',
      question: 'Which fruits?',
      options: [],
      multiSelect: true,
    },
    { header: 'Name', question: 'Called?', options: [], multiSelect: false },
  ],
});

const codex = call('request_user_input', {
  questions: [
    {
      id: 'db',
      header: 'Database',
      question: 'Which?',
      isOther: true,
      isSecret: false,
      options: [{ label: 'Postgres', description: '' }],
    },
    {
      id: 'token',
      header: 'Token',
      question: 'Paste it',
      isOther: true,
      isSecret: true,
      options: null,
    },
  ],
});

describe("an Agent Question's call", () => {
  it("reads Claude's answers by question, several in one", () => {
    const read = askedOf(
      claude,
      result(
        'The user answered: "Which \\"colour\\"?"="Red", "Which fruits?"="Apple, Pear". You can now continue with the user\'s answers in mind.',
      ),
    );
    expect(read).toEqual({
      declined: false,
      asked: [
        {
          header: 'Colour',
          question: 'Which "colour"?',
          secret: false,
          answer: ['Red'],
        },
        {
          header: 'Fruits',
          question: 'Which fruits?',
          secret: false,
          answer: ['Apple', 'Pear'],
        },
        { header: 'Name', question: 'Called?', secret: false, answer: null },
      ],
    });
  });

  it("reads Claude's as asked while it waits, and as skipped once declined", () => {
    expect(
      askedOf(claude, null)?.asked.every(({ answer }) => answer === null),
    ).toBe(true);
    expect(
      askedOf(
        claude,
        result(
          'The user declined to answer the questions. Carry on without their answers.',
          true,
        ),
      )?.declined,
    ).toBe(true);
  });

  it("reads Codex's by header, a secret's answer kept as one", () => {
    const read = askedOf(
      codex,
      result('Database: Postgres, MySQL\nToken: (hidden)'),
    );
    expect(read?.asked.map(({ secret, answer }) => [secret, answer])).toEqual([
      [false, ['Postgres', 'MySQL']],
      [true, ['(hidden)']],
    ]);
    expect(read?.declined).toBe(false);
    expect(askedOf(codex, result('Not answered', true))?.declined).toBe(true);
  });

  it('is never folded into a run of calls', () => {
    const tool = (id: string): Row => ({
      kind: 'tool',
      id,
      call: { ...call(id, {}), id },
      result: null,
      state: 'done',
    });
    expect(grouped([tool('a'), tool('b')]).map(({ kind }) => kind)).toEqual([
      'row',
      'row',
    ]);
  });

  it('is no question when its input holds none', () => {
    expect(askedOf(call('x', { nothing: true }), null)).toBeNull();
    expect(
      askedOf(call('x', { questions: [{ header: 'H' }] }), null),
    ).toBeNull();
  });
});
