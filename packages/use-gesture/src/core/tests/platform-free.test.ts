/// <reference types="vite/client" />
import { describe, expect, it } from 'vitest';

// The core runs wherever a touch source can feed it: a browser, a phone. It
// imports no package at all, so no react-dom, React Native or Motion can
// creep in, and it touches no global only a browser has. Laymos keeps it
// from importing `./web`; `tsconfig.core.json` compiles it with no DOM.

const sources = {
  ...import.meta.glob<string>(['../**/*.ts', '!../**/tests/**'], {
    query: '?raw',
    import: 'default',
    eager: true,
  }),
  ...import.meta.glob<string>('../../index.ts', {
    query: '?raw',
    import: 'default',
    eager: true,
  }),
};

// Globals a browser has and a phone does not, or the other way round.
const PLATFORM_GLOBALS = [
  'window',
  'document',
  'navigator',
  'location',
  'history',
  'matchMedia',
  'getComputedStyle',
  'innerWidth',
  'innerHeight',
  'performance',
  'requestAnimationFrame',
  'Element',
  'HTMLElement',
  'PointerEvent',
  'TouchEvent',
];

const withoutComments = (code: string) =>
  code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

const files = Object.entries(sources).map(([file, code]) => ({
  file,
  code: withoutComments(code),
}));

describe('the core of @kstackz/use-gesture is platform-free', () => {
  it('finds its sources', () => {
    expect(files.length).toBeGreaterThan(8);
  });

  it('imports only its own files, never the web', () => {
    const found = files.flatMap(({ file, code }) =>
      [...code.matchAll(/(?:from|import)\s*\(?\s*'([^']+)'/g)]
        .map((match) => match[1] ?? '')
        .filter(
          (specifier) =>
            !specifier.startsWith('.') || /\/web\//.test(specifier),
        )
        .map((specifier) => `${file}: ${specifier}`),
    );
    expect(found).toEqual([]);
  });

  it('touches no global one platform lacks', () => {
    const found = files.flatMap(({ file, code }) =>
      PLATFORM_GLOBALS.filter((name) =>
        new RegExp(`(?<![.\\w'"\`])${name}(?![\\w'"\`])`).test(code),
      ).map((name) => `${file}: ${name}`),
    );
    expect(found).toEqual([]);
  });
});
