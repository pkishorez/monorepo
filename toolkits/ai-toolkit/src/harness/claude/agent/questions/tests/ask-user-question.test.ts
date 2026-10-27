import { describe, expect, it } from 'vitest';
import { answered, toQuestion } from '../ask-user-question.js';

const colour = {
  question: 'Which colour?',
  header: 'Colour',
  options: [
    { label: 'Red', description: 'Warm' },
    { label: 'Blue', description: 'Cool', preview: '<b>blue</b>' },
  ],
  multiSelect: false,
};
const fruits = {
  question: 'Which fruits?',
  header: 'Fruits',
  options: [
    { label: 'Apples', description: '' },
    { label: 'Bananas', description: '' },
  ],
  multiSelect: true,
};
const input = { questions: [colour, fruits] };

describe('AskUserQuestion', () => {
  it('asks each question as an Item, by its place in the list', () => {
    expect(toQuestion('toolu_1', input, 5)).toEqual({
      id: 'toolu_1',
      askedAt: 5,
      items: [
        {
          id: '0',
          header: 'Colour',
          question: 'Which colour?',
          options: [
            { label: 'Red', description: 'Warm' },
            { label: 'Blue', description: 'Cool' },
          ],
          multiSelect: false,
          other: true,
          secret: false,
        },
        expect.objectContaining({ id: '1', multiSelect: true }),
      ],
    });
  });

  it('asks nothing when its input holds no question', () => {
    expect(toQuestion('toolu_1', {}, 5)).toBeUndefined();
    expect(toQuestion('toolu_1', { questions: [{}] }, 5)).toBeUndefined();
  });

  it('answers by question text, choices joined, typed text as it is', () => {
    const question = toQuestion('toolu_1', input, 5)!;
    expect(
      answered(question, input, {
        '0': ['Something green'],
        '1': ['Apples', 'Bananas'],
      }),
    ).toEqual({
      ...input,
      answers: {
        'Which colour?': 'Something green',
        'Which fruits?': 'Apples, Bananas',
      },
    });
  });

  it('leaves out an Item answered with nothing', () => {
    const question = toQuestion('toolu_1', input, 5)!;
    expect(answered(question, input, { '1': [] }).answers).toEqual({});
  });
});
