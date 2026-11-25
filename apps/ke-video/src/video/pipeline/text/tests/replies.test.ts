import { Effect, Result } from 'effect';
import { describe, expect, it } from 'vitest';
import {
  askTwice,
  chunks,
  decodeCuts,
  decodeSummary,
  jsonIn,
  learn,
  mergeCuts,
  savedCuts,
  sentencesKey,
} from '../replies.ts';

const cut = (
  from: number,
  to: number,
  kind: 'ad' | 'ask' | 'filler-talk' = 'ad',
  reason = 'r',
) => ({
  from,
  to,
  kind,
  reason,
});

describe('jsonIn', () => {
  it('reads a bare object, one in a ```json fence, or one amid words', () => {
    expect(jsonIn('{"a":1}')).toEqual(Result.succeed({ a: 1 }));
    expect(jsonIn('Here you go:\n```json\n{"a":2}\n```\n')).toEqual(
      Result.succeed({ a: 2 }),
    );
    expect(jsonIn('Sure! {"a":3} Hope it helps.')).toEqual(
      Result.succeed({ a: 3 }),
    );
    expect(Result.isFailure(jsonIn('no json here'))).toBe(true);
  });
});

describe('decodeCuts', () => {
  const decode = decodeCuts(1, 10);

  it('accepts the shape and merges overlapping cuts', () => {
    const reply = JSON.stringify({
      cuts: [
        cut(5, 7, 'filler-talk', 'travel'),
        cut(2, 3),
        cut(6, 8, 'ad', 'vpn'),
      ],
      learnings: [],
    });
    expect(decode(reply)).toEqual(
      Result.succeed({
        cuts: [
          cut(2, 3),
          { from: 5, to: 8, kind: 'ad', reason: 'travel; vpn' },
        ],
        learnings: [],
      }),
    );
  });

  it('says what is wrong: the shape, a backwards cut, a sentence that does not exist', () => {
    const failure = (reply: string) => {
      const decoded = decode(reply);
      return Result.isFailure(decoded) ? decoded.failure : null;
    };
    expect(failure('{"cuts":[{"from":1}],"learnings":[]}')).toContain(
      '["cuts"][0]',
    );
    expect(failure(JSON.stringify({ cuts: [cut(4, 2)], learnings: [] }))).toBe(
      'cut 4–2 has "from" after "to"',
    );
    expect(failure(JSON.stringify({ cuts: [cut(9, 11)], learnings: [] }))).toBe(
      'sentence 11 does not exist; the sentences are 1 to 10',
    );
  });
});

describe('decodeSummary', () => {
  it('checks every sentence number exists', () => {
    const reply = (sentence: number) =>
      JSON.stringify({
        overview: 'o',
        points: [{ text: 'p', sentence }],
        chapters: [{ title: 'c', sentence: 1 }],
        learnings: [],
      });
    expect(Result.isSuccess(decodeSummary(3)(reply(3)))).toBe(true);
    expect(Result.isFailure(decodeSummary(3)(reply(4)))).toBe(true);
  });
});

describe('mergeCuts', () => {
  it('lets an ad win over an ask, and an ask over filler talk', () => {
    expect(
      mergeCuts([cut(1, 4, 'filler-talk', 'x'), cut(3, 5, 'ask', 'x')]),
    ).toEqual([{ from: 1, to: 5, kind: 'ask', reason: 'x' }]);
    expect(mergeCuts([cut(1, 2), cut(3, 4)])).toHaveLength(2);
  });
});

describe('savedCuts', () => {
  const sentences = [
    { start: 0, text: 'Welcome back.' },
    { start: 2.5, text: 'Hit subscribe.' },
  ];
  const key = sentencesKey(sentences);
  const saved = {
    sentences: key,
    strength: 'normal',
    cuts: [cut(1, 1, 'filler-talk', 'welcome'), cut(2, 2, 'ask', 'subscribe')],
    learnings: [],
  };

  it("reads Claude's saved answer for the same sentences and strength", () => {
    expect(savedCuts(saved, key, 'normal')).toEqual(saved);
  });

  it('refuses an answer for other sentences, another strength, or a broken file', () => {
    const other = sentencesKey([{ start: 0, text: 'Welcome.' }]);
    expect(other).not.toBe(key);
    expect(savedCuts(saved, other, 'normal')).toBeNull();
    expect(savedCuts(saved, key, 'heavy')).toBeNull();
    expect(
      savedCuts({ ...saved, cuts: [{ from: 1 }] }, key, 'normal'),
    ).toBeNull();
    expect(savedCuts(null, key, 'normal')).toBeNull();
  });
});

describe('askTwice', () => {
  const decode = (reply: string) =>
    reply === 'good' ? Result.succeed('ok') : Result.fail(`bad reply ${reply}`);

  it('asks once when the reply decodes', async () => {
    const asked: Array<string> = [];
    const answer = await Effect.runPromise(
      askTwice(
        (p) => Effect.sync(() => (asked.push(p), 'good')),
        'prompt',
        decode,
      ),
    );
    expect(answer).toEqual(Result.succeed('ok'));
    expect(asked).toHaveLength(1);
  });

  it('asks again with the error appended, and gives up after the second', async () => {
    const asked: Array<string> = [];
    const replies = ['nope', 'still'];
    const answer = await Effect.runPromise(
      askTwice(
        (p) => Effect.sync(() => (asked.push(p), replies.shift()!)),
        'prompt',
        decode,
      ),
    );
    expect(answer).toEqual(Result.fail('bad reply still'));
    expect(asked).toHaveLength(2);
    expect(asked[1]).toContain('prompt');
    expect(asked[1]).toContain('bad reply nope');
  });
});

describe('chunks', () => {
  it('keeps a short transcript whole', () => {
    expect(chunks(2500)).toEqual([{ from: 1, to: 2500 }]);
    expect(chunks(0)).toEqual([]);
  });

  it('splits a long one with 20 sentences of overlap', () => {
    expect(chunks(6000)).toEqual([
      { from: 1, to: 2500 },
      { from: 2481, to: 4980 },
      { from: 4961, to: 6000 },
    ]);
  });
});

describe('learn', () => {
  it('appends new learnings with the id and date, skipping repeats', () => {
    const first = learn(
      '',
      ['Cut "smash that like button".', '  '],
      'abc',
      '2026-11-25',
    );
    expect(first.file).toBe(
      '- Cut "smash that like button". (abc, 2026-11-25)\n',
    );
    const second = learn(
      first.file,
      [
        'cut "smash  that like button".',
        'Keep code walkthroughs.',
        'Keep code walkthroughs.',
      ],
      'def',
      '2026-11-26',
    );
    expect(second.added).toEqual(['Keep code walkthroughs.']);
    expect(second.file).toBe(
      '- Cut "smash that like button". (abc, 2026-11-25)\n- Keep code walkthroughs. (def, 2026-11-26)\n',
    );
  });

  it('leaves the file alone when nothing is new', () => {
    expect(learn('# Learnings', [], 'x', 'd')).toEqual({
      file: '# Learnings',
      added: [],
    });
  });
});
