import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { DEMO, DOCS } from '../../shared/index.ts';

/*
 * Every link a docs page makes to the site names a page the site has, so a
 * renamed or mistyped slug fails here rather than on the page.
 */

const mdx = (dir: string): Array<string> =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory()
      ? mdx(join(dir, entry.name))
      : entry.name.endsWith('.mdx')
        ? [join(dir, entry.name)]
        : [],
  );

const PATHS = new Set([
  '/',
  '/kabuki',
  DEMO.href,
  ...DOCS.map((doc) => `/kabuki/${doc.slug}`),
]);

describe('docs links', () => {
  for (const file of mdx(import.meta.dirname)) {
    it(file.slice(import.meta.dirname.length + 1), () => {
      const links = [
        ...readFileSync(file, 'utf8').matchAll(/\]\((\/[^)\s#]*)/g),
      ];
      for (const [, path] of links)
        expect(PATHS, `${path} is not on the site`).toContain(path);
    });
  }
});
