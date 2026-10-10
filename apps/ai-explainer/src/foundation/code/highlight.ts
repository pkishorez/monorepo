import tsx from '@shikijs/langs/tsx';
import typescript from '@shikijs/langs/typescript';
import githubLight from '@shikijs/themes/github-light';
import oneDarkPro from '@shikijs/themes/one-dark-pro';
import vitesseDark from '@shikijs/themes/vitesse-dark';
import { createHighlighterCoreSync, type ThemedToken } from 'shiki/core';
import { createJavaScriptRegexEngine } from 'shiki/engine/javascript';

// Synchronous, so a frame never renders before its code is coloured.
const highlighter = createHighlighterCoreSync({
  themes: [githubLight, vitesseDark, oneDarkPro],
  langs: [tsx, typescript],
  engine: createJavaScriptRegexEngine(),
});

export type Lang = 'tsx' | 'typescript';
export type Theme = 'github-light' | 'vitesse-dark' | 'one-dark-pro';

const cache = new Map<string, ThemedToken[][]>();

export function tokens(code: string, lang: Lang, theme: Theme) {
  const key = `${lang}:${theme}:${code}`;
  let lines = cache.get(key);
  if (!lines) {
    lines = highlighter.codeToTokensBase(code.replace(/\n$/, ''), {
      lang,
      theme,
    });
    cache.set(key, lines);
  }
  return lines;
}

// The 1-based, inclusive lines of the block that starts on the first line
// containing `start` (looking only below the first line containing
// `within`): that line, every more indented line after it, and the bracket
// that closes it. Blocks are found by text so they survive edits to the
// source.
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
  ) {
    last++;
  }
  if (last > first && /^[})\]]/.test(lines[last + 1]?.trimStart() ?? ''))
    last++;
  while (lines[last]!.trim() === '') last--;
  return [first + 1, last + 1];
}
