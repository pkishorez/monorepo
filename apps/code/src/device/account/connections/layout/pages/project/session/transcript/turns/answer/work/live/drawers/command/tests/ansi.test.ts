import { describe, expect, it } from 'vitest';
import {
  EMPTY,
  feed,
  type Line,
  linesOf,
  MAX_LINES,
  PLAIN,
  type Screen,
} from '../ansi.ts';

/* A command's output as a terminal shows it, read piece by piece. */

const read = (...pieces: ReadonlyArray<string>): Screen =>
  pieces.reduce(feed, EMPTY);

const texts = (line: Line | undefined) => line?.map((span) => span.text);

describe('feed', () => {
  it('splits plain text into lines, the last one still being written', () => {
    const screen = read('one\ntwo\nthr', 'ee');
    expect(linesOf(screen).map(texts)).toEqual([['one'], ['two'], ['three']]);
  });

  it('styles text by its SGR codes, and resets on 0', () => {
    const [line] = linesOf(
      read('\x1b[32mready\x1b[0m in \x1b[1;31m9ms\x1b[m\n'),
    );
    expect(line).toEqual([
      { text: 'ready', style: { ...PLAIN, fg: 2 } },
      { text: ' in ', style: PLAIN },
      { text: '9ms', style: { ...PLAIN, fg: 1, bold: true } },
    ]);
  });

  it('reads bright, 256 and true colours, and backgrounds', () => {
    const [line] = linesOf(
      read('\x1b[94ma\x1b[38;5;196mb\x1b[38;2;10;20;30mc\x1b[43md\n'),
    );
    expect(line?.map((span) => [span.style.fg, span.style.bg])).toEqual([
      [12, null],
      ['rgb(255 0 0)', null],
      ['rgb(10 20 30)', null],
      ['rgb(10 20 30)', 3],
    ]);
  });

  it('keeps a code cut between two pieces for the next', () => {
    const screen = read('\x1b[3', '2mgreen\n');
    expect(linesOf(screen)[0]).toEqual([
      { text: 'green', style: { ...PLAIN, fg: 2 } },
    ]);
  });

  it('drops codes that move the cursor or name the window', () => {
    const screen = read('\x1b]0;title\x07\x1b[2K\x1b[1Gdone\x1b(B\n');
    expect(linesOf(screen).map(texts)).toEqual([['done']]);
  });

  it('writes a line again after a carriage return, but ends it on \\r\\n', () => {
    const screen = read('10%\r50%\r100%\r', '\nnext\r\n');
    expect(linesOf(screen).map(texts)).toEqual([['100%'], ['next']]);
  });

  it('keeps only the last lines', () => {
    const screen = read('x\n'.repeat(MAX_LINES + 10));
    expect(screen.lines).toHaveLength(MAX_LINES);
  });
});
