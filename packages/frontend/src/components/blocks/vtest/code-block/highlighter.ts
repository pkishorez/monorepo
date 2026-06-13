import { createHighlighterCoreSync, type HighlighterCore } from 'shiki/core';
import { createJavaScriptRegexEngine } from 'shiki/engine/javascript';
import githubLight from '@shikijs/themes/github-light';
import githubDark from '@shikijs/themes/github-dark';
import tsx from '@shikijs/langs/tsx';
import typescript from '@shikijs/langs/typescript';
import javascript from '@shikijs/langs/javascript';
import jsx from '@shikijs/langs/jsx';
import json from '@shikijs/langs/json';
import bash from '@shikijs/langs/bash';
import css from '@shikijs/langs/css';
import html from '@shikijs/langs/html';
import markdown from '@shikijs/langs/markdown';
import diff from '@shikijs/langs/diff';
import yaml from '@shikijs/langs/yaml';

/** Theme ids registered below; both render in one pass for CSS-driven light/dark. */
export const THEMES = { light: 'github-light', dark: 'github-dark' } as const;

/**
 * Shared synchronous Shiki highlighter for the vtest docs. Built once at module
 * load with a JS-regex engine (no async WASM) and a curated grammar set, so
 * {@link CodeBlock} can tokenize during a normal synchronous render — matching
 * the old prism behaviour but with richer, dual-theme highlighting.
 */
export const highlighter: HighlighterCore = createHighlighterCoreSync({
  engine: createJavaScriptRegexEngine({ forgiving: true }),
  themes: [githubLight, githubDark],
  langs: [
    tsx,
    typescript,
    javascript,
    jsx,
    json,
    bash,
    css,
    html,
    markdown,
    diff,
    yaml,
  ],
});

const ALIASES: Record<string, string> = {
  ts: 'typescript',
  js: 'javascript',
  mjs: 'javascript',
  cjs: 'javascript',
  sh: 'bash',
  shell: 'bash',
  zsh: 'bash',
  yml: 'yaml',
  md: 'markdown',
  mdx: 'markdown',
};

const LOADED = new Set(highlighter.getLoadedLanguages());

/**
 * Maps a fence language to a loaded Shiki grammar id, applying common aliases.
 * Unknown or un-bundled languages fall back to `text` (plain, no highlight)
 * rather than throwing.
 */
export function resolveLang(language: string): string {
  const lower = language.toLowerCase();
  const id = ALIASES[lower] ?? lower;
  return LOADED.has(id) ? id : 'text';
}
