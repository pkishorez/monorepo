import { expect } from 'vitest';

import { vdescribe, vtest } from '@monorepo/vtest';

const slugify = (s: string): string =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

vdescribe(
  'happy path',
  'The common case — natural-language input becomes a clean slug.',
  () => {
    vtest('lowercases ASCII', 'Trivial casefolding.', () => {
      expect(slugify('Hello World')).toBe('hello-world');
    });

    vtest(
      'strips diacritics via NFD',
      'Combining marks are removed; the underlying base letter survives.',
      () => {
        expect(slugify('Héllo Wörld')).toBe('hello-world');
        expect(slugify('Café crème')).toBe('cafe-creme');
      },
    );

    vtest(
      'drops punctuation',
      'Any non-alphanumeric character becomes a separator candidate.',
      () => {
        expect(slugify("It's a test!")).toBe('it-s-a-test');
      },
    );
  },
);

vdescribe(
  'edge cases',
  'Inputs that would otherwise produce empty tokens or leading/trailing separators.',
  () => {
    vtest(
      'collapses runs of separators',
      'Multiple symbols in a row collapse to a single hyphen.',
      () => {
        expect(slugify('a   b---c')).toBe('a-b-c');
      },
    );

    vtest(
      'trims leading and trailing hyphens',
      'After collapsing, the result is stripped on both ends.',
      () => {
        expect(slugify('  --leading--  ')).toBe('leading');
        expect(slugify('!!middle!!')).toBe('middle');
      },
    );

    vtest(
      'returns empty for separator-only input',
      'No alphanumerics means no slug.',
      () => {
        expect(slugify('!!!')).toBe('');
        expect(slugify('   ')).toBe('');
      },
    );

    vtest(
      'preserves digits',
      'Numbers are alphanumerics — they survive the filter.',
      () => {
        expect(slugify('2026 roadmap')).toBe('2026-roadmap');
      },
    );
  },
);
