import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

// Core runs in a browser and on a phone alike: whatever only one platform
// has comes in through the platform each app hands it, never straight.

const ROOT = join(import.meta.dirname, '..');
const SRC = join(ROOT, 'src');

const sources = (dir: string): ReadonlyArray<string> =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sources(path);
    return /\.tsx?$/.test(entry.name) ? [path] : [];
  });

// Packages, or their entry points, that exist on one platform only.
const PLATFORM_PACKAGES = [
  /^react-dom(\/|$)/,
  /^react-native(\/|$)/,
  /^expo(-[a-z-]+)?(\/|$)/,
  /^@expo\//,
  /^@kstackz\/std-toolkit\/db\/idb$/,
  /^@kstackz\/std-toolkit\/sync\/(idb|sqlite)$/,
  /^@kstackz\/auth-toolkit\/client\/expo$/,
];

// Globals only a browser has.
const BROWSER_GLOBALS = [
  'window',
  'document',
  'indexedDB',
  'localStorage',
  'sessionStorage',
  'navigator',
  'location',
  'history',
];

const withoutComments = (code: string) =>
  code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

const importsOf = (code: string) =>
  [...code.matchAll(/(?:from|import)\s*\(?\s*'([^']+)'/g)].map(
    (match) => match[1]!,
  );

describe('@ledger/core is platform-free', () => {
  const files = sources(SRC).map((path) => ({
    file: relative(ROOT, path),
    code: withoutComments(readFileSync(path, 'utf8')),
  }));

  it('finds its sources', () => {
    expect(files.length).toBeGreaterThan(20);
  });

  it('imports nothing that exists on one platform only', () => {
    const found = files.flatMap(({ file, code }) =>
      importsOf(code)
        .filter((specifier) =>
          PLATFORM_PACKAGES.some((pattern) => pattern.test(specifier)),
        )
        .map((specifier) => `${file}: ${specifier}`),
    );
    expect(found).toEqual([]);
  });

  it('touches no browser global', () => {
    const found = files.flatMap(({ file, code }) =>
      BROWSER_GLOBALS.filter((name) =>
        new RegExp(`(?<![.\\w'"\`])${name}\\s*[.([]`).test(code),
      ).map((name) => `${file}: ${name}`),
    );
    expect(found).toEqual([]);
  });

  it('depends on no platform package', () => {
    const manifest = JSON.parse(
      readFileSync(join(ROOT, 'package.json'), 'utf8'),
    ) as { dependencies?: Record<string, string> };
    const names = Object.keys(manifest.dependencies ?? {});
    expect(
      names.filter((name) =>
        PLATFORM_PACKAGES.some((pattern) => pattern.test(name)),
      ),
    ).toEqual([]);
  });
});
