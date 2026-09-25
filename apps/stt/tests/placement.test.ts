import { describe, expect, it } from 'vite-plus/test';
import {
  buildTranscript,
  type Injection,
  type TimedWord,
} from '../src/engine/transcript/index.ts';

const word = (
  text: string,
  start: number,
  end: number,
  final = true,
): TimedWord => ({ text, start, end, final }) as TimedWord;

const injection = (at: number, sequence: number): Injection<string> => ({
  id: `i${sequence}`,
  at,
  sequence,
  payload: `p${sequence}`,
});

const shape = (segments: ReturnType<typeof buildTranscript>['segments']) =>
  segments.map((segment) =>
    segment.kind === 'transcription' ? segment.text : `[${segment.payload}]`,
  );

// "take a look at this" spoken over 0-2.5 s
const words = [
  word('take', 0.0, 0.3),
  word('a', 0.3, 0.4),
  word('look', 0.4, 0.8),
  word('at', 0.8, 1.0),
  word('this', 1.0, 1.5),
];

describe('placement', () => {
  it('lands after every word that started before the press', () => {
    const { segments } = buildTranscript(words, [injection(0.85, 0)], {
      final: true,
    });
    expect(shape(segments)).toEqual(['take a look at', '[p0]', 'this']);
  });

  it('goes after a word that is under way at the press', () => {
    // just after "look" starts (0.4-0.8)
    const early = buildTranscript(words, [injection(0.45, 0)], {
      final: true,
    });
    expect(shape(early.segments)).toEqual(['take a look', '[p0]', 'at this']);
    // late inside "this" (1.0-1.5)
    const late = buildTranscript(words, [injection(1.4, 0)], { final: true });
    expect(shape(late.segments)).toEqual(['take a look at this', '[p0]']);
  });

  it('lands at the start before the first word and after the last during silence', () => {
    const before = buildTranscript(words, [injection(-0.5, 0)], {
      final: true,
    });
    expect(shape(before.segments)).toEqual(['[p0]', 'take a look at this']);
    const silence = buildTranscript(words, [injection(9, 0)], { final: true });
    expect(shape(silence.segments)).toEqual(['take a look at this', '[p0]']);
  });

  it('keeps press order when several land on one boundary', () => {
    const { segments } = buildTranscript(
      words,
      [injection(0.7, 1), injection(0.6, 0)],
      { final: true },
    );
    expect(shape(segments)).toEqual(['take a look', '[p0]', '[p1]', 'at this']);
  });

  it('places a press with no words at all at the start', () => {
    const { segments } = buildTranscript([], [injection(0.5, 0)], {
      final: false,
    });
    expect(shape(segments)).toEqual(['[p0]']);
  });

  it('settles an injection only once the words around it are final', () => {
    const mixed = [
      word('take', 0.0, 0.3),
      word('a', 0.3, 0.4),
      word('look', 0.4, 0.8, false),
      word('at', 0.8, 1.0, false),
    ];
    const { segments } = buildTranscript(
      mixed,
      [injection(0.35, 0), injection(0.9, 1)],
      { final: false },
    );
    const injected = segments.filter((s) => s.kind === 'injected');
    expect(injected.map((s) => s.final)).toEqual([true, false]);
    const runs = segments.filter((s) => s.kind === 'transcription');
    expect(runs.map((s) => s.final)).toEqual([true, false]);
    expect(
      buildTranscript(mixed, [injection(0.9, 1)], {
        final: true,
      }).segments.find((s) => s.kind === 'injected')?.final,
    ).toBe(true);
  });
});
