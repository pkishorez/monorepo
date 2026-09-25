import { describe, expect, it } from 'vite-plus/test';
import { RollingWords } from '../src/engine/session/rolling-words.ts';

const texts = (rolling: RollingWords) =>
  rolling.all.map((w) => `${w.text}${w.final ? '' : '?'}`);

describe('RollingWords', () => {
  it('freezes words behind the lag and keeps the rest provisional', () => {
    const rolling = new RollingWords();
    rolling.accept(
      [
        { text: 'hello', start: 0, end: 0.5 },
        { text: 'there', start: 0.5, end: 1.0 },
        { text: 'friend', start: 1.0, end: 1.6 },
      ],
      1.2,
    );
    expect(texts(rolling)).toEqual(['hello', 'there', 'friend?']);
    // the next window starts where the provisional word starts
    expect(rolling.windowStart).toBe(1.0);
  });

  it('replaces provisional words wholesale on the next pass', () => {
    const rolling = new RollingWords();
    rolling.accept([{ text: 'hell', start: 0, end: 0.4 }], 0);
    rolling.accept(
      [
        { text: 'hello', start: 0, end: 0.5 },
        { text: 'world', start: 0.5, end: 1.0 },
      ],
      0.6,
    );
    expect(texts(rolling)).toEqual(['hello', 'world?']);
  });

  it('never re-adds a word that starts before the frozen edge', () => {
    const rolling = new RollingWords();
    rolling.accept([{ text: 'one', start: 0, end: 0.5 }], 1);
    rolling.accept(
      [
        { text: 'one', start: 0.1, end: 0.5 },
        { text: 'two', start: 0.5, end: 0.9 },
      ],
      0.7,
    );
    expect(texts(rolling)).toEqual(['one', 'two?']);
  });

  it('moves the edge to the last final end only when nothing is provisional', () => {
    const rolling = new RollingWords();
    rolling.accept([{ text: 'done', start: 0, end: 0.5 }], 2);
    expect(rolling.windowStart).toBe(0.5);
  });

  it('never freezes a word behind a provisional one', () => {
    const rolling = new RollingWords();
    rolling.accept(
      [
        { text: 'a', start: 0, end: 0.4 },
        { text: 'b', start: 0.5, end: 2.0 },
        { text: 'c', start: 2.0, end: 2.2 },
      ],
      1.0,
    );
    expect(texts(rolling)).toEqual(['a', 'b?', 'c?']);
    expect(rolling.windowStart).toBe(0.5);
  });

  it('skips ahead when the unfrozen stretch outgrows the window', () => {
    const rolling = new RollingWords();
    rolling.capWindow(40, 15);
    expect(rolling.windowStart).toBe(25);
  });

  it('freezes everything on the last pass', () => {
    const rolling = new RollingWords();
    rolling.accept([{ text: 'bye', start: 0, end: 0.4 }], 0);
    rolling.freezeAll();
    expect(texts(rolling)).toEqual(['bye']);
  });
});
