import type { Story } from '../../landing/index.ts';

/*
 * Every word on std-toolkit's landing page after its first screen, in the
 * order the page reads: one idea per Part of the docs, then where to go
 * next. Each idea names the shape the particle field takes while it is
 * read. In a body, `backticks` mark code. Package names are lowercase.
 */

export const IDEAS: ReadonlyArray<Story> = [
  {
    shape: 'versions',
    label: 'evolving schema',
    title: 'Every version, kept.',
    body: 'Describe a shape once. When it changes, add a version with `evolve` and a migration. A row saved a year ago still reads, in today’s shape, and nothing rewrites the table.',
  },
  {
    shape: 'entities',
    label: 'entities',
    title: 'Many of a kind, or one.',
    body: 'A keyed entity is many of a kind, each found by its key, like tasks on a board. A single entity is the one settings record, with a default until you save it.',
  },
  {
    shape: 'oneTable',
    label: 'stdtable',
    title: 'One table for everything.',
    body: 'Every entity shares one table, told apart by its key. Indexes find things by more than their key, and a snapshot fails a test before a breaking change can ship.',
  },
  {
    shape: 'adapters',
    label: 'adapters',
    title: 'Any database.',
    body: 'Memory for tests, IndexedDB in the browser, SQLite or DynamoDB on a server. Moving between them changes one line: the layer your program runs on.',
  },
  {
    shape: 'std',
    label: 'sync',
    title: 'Fresh on every screen.',
    body: 'Sync keeps your app’s copy of the table fresh: one copy for every tab, open offline, edits sent back. Rows saved in an old shape arrive in the new one.',
  },
];

/** The end of the page, past the story: where to go next. */
export const ENDING = {
  label: 'start here',
  title: 'Start with a shape.',
  pitch: 'Five parts, read in order. Or jump straight in.',
} as const;
