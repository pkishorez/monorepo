/*
 * std-toolkit's table of contents: every docs page, in the order the
 * sidebar shows it. First how to start; then its five Parts, read as one
 * story: the shape your data has and how it changes, the entities that
 * save it, the one table they share, the adapter that puts the table on a
 * database, and the sync that keeps an app's copy fresh. A page's slug is
 * its URL under /std-toolkit.
 */

import { contents } from './contents.ts';
import type { SlugOf, Written } from './contents.ts';

const TABLE = [
  {
    title: 'Get started',
    groups: [
      {
        docs: [
          {
            slug: 'introduction',
            title: 'The big picture',
            summary:
              'Data outlives code. What std-toolkit does about it, in five parts.',
          },
          {
            slug: 'quick-start',
            title: 'Quick start',
            summary: 'A task list saved, changed and read back, in memory.',
          },
        ],
      },
    ],
  },
  {
    title: 'Evolving schema',
    path: '@kestack/std-toolkit/eschema',
    groups: [
      {
        title: 'Why',
        docs: [
          {
            slug: 'why-evolving-schema',
            title: 'Why schemas evolve',
            summary: 'An API change is a moment; a saved row lives on.',
          },
          {
            slug: 'keep-every-version',
            title: 'Keep every version',
            summary: 'The one idea: stamp each row, upgrade it as it is read.',
          },
        ],
      },
      {
        title: 'ESchema',
        docs: [
          {
            slug: 'eschema',
            title: 'ESchema',
            summary: 'A shape with a name and a version stamp.',
          },
          {
            slug: 'adding-a-version',
            title: 'Adding a version',
            summary:
              'One evolve step, and every old row reads in the new shape.',
          },
          {
            slug: 'reading-and-writing',
            title: 'Reading and writing',
            summary:
              'Reads upgrade, writes use the latest: what happens at each step.',
          },
        ],
      },
      {
        title: 'More shapes',
        docs: [
          {
            slug: 'entity-eschema',
            title: 'EntityESchema',
            summary: 'An ESchema that also carries an id.',
          },
          {
            slug: 'value-eschema',
            title: 'ValueESchema',
            summary: 'A versioned value that is not an object.',
          },
          {
            slug: 'shapes-inside-shapes',
            title: 'Shapes inside shapes',
            summary: 'A versioned value inside a row, upgrading on its own.',
          },
        ],
      },
      {
        title: 'Changing a shape',
        docs: [
          {
            slug: 'rename-and-remove',
            title: 'Rename and remove',
            summary:
              'Take a field away, or give it a new name, keeping its value.',
          },
          {
            slug: 'adopting-existing-data',
            title: 'Adopting existing data',
            summary: 'Rows saved before you versioned anything read as v1.',
          },
        ],
      },
      {
        title: 'Staying safe',
        docs: [
          {
            slug: 'upgrade-check',
            title: 'Upgrade check',
            summary: 'A test that every old row still reads, before you ship.',
          },
          {
            slug: 'gotchas',
            title: 'Gotchas',
            summary:
              'A row too new for an old release, a migration that fails, and what to avoid.',
          },
        ],
      },
    ],
  },
  {
    title: 'Entities',
    path: '@kestack/std-toolkit/db',
    groups: [
      {
        docs: [
          {
            slug: 'what-is-an-entity',
            title: 'What an entity is',
            summary:
              'A shape, a key and a table: something you can save and find.',
          },
        ],
      },
      {
        title: 'Two kinds',
        docs: [
          {
            slug: 'keyed-entity',
            title: 'Keyed entity',
            summary: 'Many of a kind, each found by its key.',
          },
          {
            slug: 'single-entity',
            title: 'Single entity',
            summary:
              'A thing there is exactly one of, with a default until saved.',
          },
        ],
      },
      {
        title: 'Watching',
        docs: [
          {
            slug: 'subscribing',
            title: 'Subscribing',
            summary: 'Hear about every saved change, as it is saved.',
          },
        ],
      },
    ],
  },
  {
    title: 'StdTable',
    path: '@kestack/std-toolkit/db',
    groups: [
      {
        title: 'One table',
        docs: [
          {
            slug: 'single-table-design',
            title: 'Why one table',
            summary: 'Every kind of thing in one table, told apart by its key.',
          },
          {
            slug: 'indexes',
            title: 'Indexes',
            summary: 'Find things by more than their primary key.',
          },
          {
            slug: 'drift-and-reindex',
            title: 'Drift and reindex',
            summary:
              'A new index, the old rows missing from it, and how they get in.',
          },
        ],
      },
      {
        title: 'Shipping',
        docs: [
          {
            slug: 'table-mode',
            title: 'Table mode',
            summary:
              'Persistent or disposable: what a change may cost your data.',
          },
          {
            slug: 'snapshot',
            title: 'Snapshot',
            summary:
              'The shapes you shipped, frozen, so a breaking change fails a test.',
          },
          {
            slug: 'transactions',
            title: 'Transactions and scan',
            summary: 'Many writes as one, and every row at once.',
          },
        ],
      },
    ],
  },
  {
    title: 'Adapters',
    path: '@kestack/std-toolkit/db/*',
    groups: [
      {
        docs: [
          {
            slug: 'what-is-an-adapter',
            title: 'What an adapter is',
            summary:
              'One program, any database: the layer decides where it runs.',
          },
        ],
      },
      {
        title: 'In the browser',
        docs: [
          {
            slug: 'memory',
            title: 'Memory',
            summary:
              'A table that lives as long as the page: for tests and demos.',
          },
          {
            slug: 'indexeddb',
            title: 'IndexedDB',
            summary: 'A table in the browser that survives a reload.',
          },
        ],
      },
      {
        title: 'On the server',
        docs: [
          {
            slug: 'sqlite',
            title: 'SQLite',
            summary:
              'One table in SQLite, on Node, Bun, D1 or a Durable Object.',
          },
          {
            slug: 'dynamodb',
            title: 'DynamoDB',
            summary: 'The single-table design it was made for.',
          },
          {
            slug: 'deploying',
            title: 'Deploying',
            summary:
              'A table as infrastructure, guarded against breaking changes.',
          },
        ],
      },
    ],
  },
  {
    title: 'Sync',
    path: '@kestack/std-toolkit/sync',
    groups: [
      {
        docs: [
          {
            slug: 'how-sync-works',
            title: 'How sync works',
            summary:
              'The server keeps the table; each screen keeps a fresh copy.',
          },
        ],
      },
      {
        title: 'Std Sync',
        docs: [
          {
            slug: 'std-sync',
            title: 'Collections',
            summary:
              'Your server’s rows, kept fresh in a TanStack DB collection.',
          },
          {
            slug: 'strategies',
            title: 'Strategies',
            summary: 'Which rows to fetch first, and how many.',
          },
          {
            slug: 'across-tabs',
            title: 'Across tabs and offline',
            summary: 'One copy for every tab, opened offline, edits sent back.',
          },
        ],
      },
      {
        title: 'More',
        docs: [
          {
            slug: 'paced-updates',
            title: 'Paced updates',
            summary:
              'Many changes a second, drawn at a pace a screen can keep.',
          },
          {
            slug: 'replica',
            title: 'With kabuki',
            summary: 'Sync built from Actors, for a kabuki app.',
          },
        ],
      },
    ],
  },
] as const satisfies Written;

export const STD_TOOLKIT_CONTENTS = contents(TABLE);

/** An std-toolkit docs page's slug: what its URL ends with. */
export type StdToolkitSlug = SlugOf<typeof TABLE>;
