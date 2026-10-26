import { describe, expect, it } from 'vitest';
import type { AgentQuestion, QuestionItem } from '@kestack/connect/code';
import {
  answerFor,
  answerOf,
  choose,
  chooseOther,
  draftOf,
  type ItemDraft,
  type,
  unanswered,
} from '../answer.ts';

/*
 * An answer as it is given: one choice lets go of the other, typed or
 * not, though what was typed stays; several are any, the typed one beside;
 * an Item with no options is answered by typing alone. What is sent is
 * the labels in the options' order, then what was typed, trimmed, but a
 * secret as typed.
 */

const item = (over: Partial<QuestionItem> = {}): QuestionItem => ({
  id: 'a',
  header: 'Auth',
  question: 'Which way?',
  options: [
    { label: 'Link', description: '' },
    { label: 'Passkey', description: '' },
    { label: 'Password', description: '' },
  ],
  multiSelect: false,
  other: true,
  secret: false,
  ...over,
});

const empty: ItemDraft = { chosen: [], typed: '', other: false };

describe('an answer', () => {
  it('takes one option of a single choice, letting the typed one go but keeping its text', () => {
    const one = item();
    const typed = type(one, empty, ' magic ');
    expect(answerOf(one, typed)).toEqual(['magic']);
    const chosen = choose(one, typed, 'Passkey');
    expect(chosen).toEqual({
      chosen: ['Passkey'],
      typed: ' magic ',
      other: false,
    });
    expect(answerOf(one, chosen)).toEqual(['Passkey']);
    expect(answerOf(one, chooseOther(one, chosen))).toEqual(['magic']);
  });

  it('takes any options of several, in their order, and the typed one beside', () => {
    const many = item({ multiSelect: true });
    let draft = choose(many, empty, 'Password');
    draft = choose(many, draft, 'Link');
    draft = type(many, draft, 'SSO');
    expect(answerOf(many, draft)).toEqual(['Link', 'Password', 'SSO']);
    draft = choose(many, chooseOther(many, draft), 'Link');
    expect(answerOf(many, draft)).toEqual(['Password']);
  });

  it('is typed alone without options, a secret as typed', () => {
    const typedOnly = item({ options: [], other: false });
    expect(answerOf(typedOnly, type(typedOnly, empty, ' name '))).toEqual([
      'name',
    ]);
    const secret = item({ options: [], secret: true });
    expect(answerOf(secret, type(secret, empty, ' p@ss '))).toEqual([' p@ss ']);
    expect(answerOf(secret, type(secret, empty, '   '))).toEqual([]);
  });

  it('gives no typed answer where the agent allows none', () => {
    const closed = item({ other: false });
    expect(
      answerOf(closed, { chosen: [], typed: 'mine', other: true }),
    ).toEqual([]);
  });

  it('says which Items are left, and sends every one by its id', () => {
    const question: AgentQuestion = {
      id: 'q',
      items: [item(), item({ id: 'b', options: [] })],
      askedAt: 0,
    };
    const drafts = { a: choose(question.items[0], empty, 'Link') };
    expect(unanswered(question, drafts).map(({ id }) => id)).toEqual(['b']);
    expect(draftOf(drafts, question.items[1]!)).toEqual(empty);
    expect(
      answerFor(question, { ...drafts, b: type(item(), empty, 'x') }),
    ).toEqual({ a: ['Link'], b: ['x'] });
  });
});
