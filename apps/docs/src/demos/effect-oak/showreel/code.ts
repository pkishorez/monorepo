import tsx from '@shikijs/langs/tsx';
import vitesseDark from '@shikijs/themes/vitesse-dark';
import vitesseLight from '@shikijs/themes/vitesse-light';
import { createHighlighterCoreSync } from 'shiki/core';
import { createJavaScriptRegexEngine } from 'shiki/engine/javascript';

/*
 * The code the frame shows: coloured by Shiki in both themes at once, and cut
 * from the demo's real sources, so what is on screen is what runs.
 */

// Synchronous, so the code is coloured on its first frame.
const highlighter = createHighlighterCoreSync({
  themes: [vitesseLight, vitesseDark],
  langs: [tsx],
  engine: createJavaScriptRegexEngine(),
});

/** One run of text with its colour in the light and the dark theme. */
export type Token = {
  readonly text: string;
  readonly light: string;
  readonly dark: string;
};

const cache = new Map<string, Token[][]>();

export function tokens(code: string): Token[][] {
  let lines = cache.get(code);
  if (!lines) {
    const light = highlighter.codeToTokensBase(code, {
      lang: 'tsx',
      theme: 'vitesse-light',
    });
    const dark = highlighter.codeToTokensBase(code, {
      lang: 'tsx',
      theme: 'vitesse-dark',
    });
    lines = light.map((line, i) =>
      line.map((token, j) => ({
        text: token.content,
        light: token.color ?? 'inherit',
        dark: dark[i]?.[j]?.color ?? 'inherit',
      })),
    );
    cache.set(code, lines);
  }
  return lines;
}

/** The source without its imports and the blank lines after them. */
export const bare = (code: string) =>
  code
    .replace(/^(import[\s\S]*?;\n)+\n*/m, '')
    .replace(/^\/\*[\s\S]*?\*\/\n/, '')
    .trimEnd();

/**
 * The 1-based, inclusive lines of the block that starts on the first line
 * containing `start`, below the first line containing `within`: that line,
 * every more indented line after it, and the bracket that closes it.
 */
export function blockOf(
  code: string,
  start: string,
  within?: string,
): [number, number] {
  const lines = code.split('\n');
  const floor = within ? lines.findIndex((line) => line.includes(within)) : 0;
  if (floor < 0) throw new Error(`No line contains "${within}"`);
  const first = lines.findIndex(
    (line, i) => i >= floor && line.includes(start),
  );
  if (first < 0) throw new Error(`No line contains "${start}"`);
  const indent = (line: string) => line.length - line.trimStart().length;
  let last = first;
  while (
    last + 1 < lines.length &&
    (lines[last + 1]!.trim() === '' ||
      indent(lines[last + 1]!) > indent(lines[first]!))
  )
    last++;
  if (last > first && /^[})\]]/.test(lines[last + 1]?.trimStart() ?? ''))
    last++;
  while (lines[last]!.trim() === '') last--;
  return [first + 1, last + 1];
}

/** The lines from the first containing `from` to the next containing `to`. */
export function linesOf(
  code: string,
  from: string,
  to = from,
): [number, number] {
  const lines = code.split('\n');
  const first = lines.findIndex((line) => line.includes(from));
  if (first < 0) throw new Error(`No line contains "${from}"`);
  const last = lines.findIndex((line, i) => i >= first && line.includes(to));
  if (last < 0) throw new Error(`No line contains "${to}"`);
  return [first + 1, last + 1];
}

/** The code with the block starting at `start` cut out. */
export function without(code: string, start: string, within?: string) {
  const [from, to] = blockOf(code, start, within);
  return code
    .split('\n')
    .filter((_, i) => i + 1 < from || i + 1 > to)
    .join('\n');
}
