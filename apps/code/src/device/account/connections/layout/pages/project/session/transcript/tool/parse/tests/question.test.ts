import { describe, expect, it } from 'vitest';
import type { Part } from '@kestack/connect/code';
import type { Row } from '../../../turns/rows/index.ts';
import { grouped } from '../parse.ts';
import { askedOf } from '../question.ts';

/*
 * An Agent Question's call as the transcript reads it, from the calls each
 * harness really makes, Claude's `AskUserQuestion` and Codex's
 * `request_user_input`, and the questionAnswered each records: the
 * answers by Item id, Claude's by place in the list, Codex's by its own,
 * a secret's as "(hidden)"; null when declined. It is never folded into a
 * run of calls.
 */

type Call = Extract<Part, { readonly type: 'toolCall' }>;
type Answered = Extract<Part, { readonly type: 'questionAnswered' }>;

const call = (name: string, input: Call['input']): Call => ({
  type: 'toolCall',
  id: name,
  tool: 'question',
  name,
  title: '',
  input,
});

const answered = (answers: Answered['answers']): Answered => ({
  type: 'questionAnswered',
  toolCallId: 'call',
  answers,
});

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
  it("reads Claude's answers by place, each choice whole", () => {
    const read = askedOf(
      claude,
      answered({ '0': ['Red'], '1': ['Apple, green', 'Pear'] }),
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
          answer: ['Apple, green', 'Pear'],
        },
        { header: 'Name', question: 'Called?', secret: false, answer: null },
      ],
    });
  });

  it("reads Claude's as asked while it waits, and as skipped once declined", () => {
    expect(
      askedOf(claude, null)?.asked.every(({ answer }) => answer === null),
    ).toBe(true);
    expect(askedOf(claude, null)?.declined).toBe(false);
    expect(askedOf(claude, answered(null))?.declined).toBe(true);
  });

  it("reads Codex's by its ids, a secret's answer kept as one", () => {
    const read = askedOf(
      codex,
      answered({ db: ['Postgres', 'MySQL'], token: ['(hidden)'] }),
    );
    expect(read?.asked.map(({ secret, answer }) => [secret, answer])).toEqual([
      [false, ['Postgres', 'MySQL']],
      [true, ['(hidden)']],
    ]);
    expect(read?.declined).toBe(false);
    expect(askedOf(codex, answered(null))?.declined).toBe(true);
  });

  it('reads an Item answered with nothing as not answered', () => {
    expect(
      askedOf(codex, answered({ db: [], token: ['x'] }))?.asked.map(
        ({ answer }) => answer,
      ),
    ).toEqual([null, ['x']]);
  });

  it('is never folded into a run of calls', () => {
    const tool = (id: string): Row => ({
      kind: 'tool',
      id,
      call: { ...call(id, {}), id },
      result: null,
      answered: null,
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
