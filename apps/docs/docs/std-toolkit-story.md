# std-toolkit's docs, as one story

How std-toolkit's pages are told. Read it with [authoring.md](./authoring.md)
before writing or changing any page under `src/client/docs/std-toolkit`.

## The rule: the big picture first

Every level opens with why, then what, then how:

- **The site.** "The big picture" (`/std-toolkit/introduction`) tells the
  whole problem and the five Parts before any API.
- **A Part.** Its first page is its big picture: what problem this Part
  solves, the one idea behind it, and a map of the pages after it. No API
  detail beyond one small taste.
- **A page.** Opens with where we are in the story and the problem this page
  removes, then the one idea, then the code.

A reader never meets a word before the page that explains it. Looking
ahead is fine as "you'll meet X in Y", with a link.

## The story

Data outlives code. An API change is a moment: you change the handler, and
the callers move with it. A saved row is not: it sits in the database in
the shape the code that wrote it had, long after that code is gone. Change
the shape, and every row already saved no longer fits.

std-toolkit answers in five Parts, each built on the last:

1. **Evolving schema.** Describe a shape once, and keep every version of it.
   Each saved value carries its version, `_v`. Reading upgrades an old value,
   one migration at a time, to the latest shape. Writing always uses the
   latest. Nothing is ever rewritten in bulk.
   - **ESchema** is the base: a named object shape with versions.
   - **EntityESchema** is an ESchema that also carries an id field. That is
     the whole difference.
   - **ValueESchema** versions a value that is not an object (a word, a list),
     by wrapping it.
2. **Entities.** Give a shape a key and a place in a table, and you can save,
   get, list, update and delete it. Many of a kind (a keyed entity), or
   exactly one (a single entity). Every saved change can be heard.
3. **StdTable.** All entities share one table, told apart by their keys.
   Indexes find things by more than the key. A snapshot freezes what shipped,
   so a breaking change fails a test before it reaches data.
4. **Adapters.** The same table runs on Memory, IndexedDB, SQLite or
   DynamoDB. Your program never names a database; a layer does.
5. **Sync.** The server keeps the table; each screen keeps a fresh copy,
   shared across tabs and usable offline, in today's shape.

## The running example

One app all the way through: a **task board**. Keep these names on every
page, so each page adds to what the last one built.

- **Task**, an `EntityESchema`, named `'Task'`, id field `taskId`:
  - v1: `boardId: Schema.String`, `title: Schema.String`.
  - v2 adds `priority: Schema.Literals(['low', 'high'])`; old tasks read as
    `'low'`.
  - v3 adds `done: Schema.Boolean`; old tasks read as `false`.
  - A page about renaming or removing adds its own later version on top of
    these, and says so.
- **Board**, an `EntityESchema` named `'Board'`, id `boardId`, with `name`.
- **Settings**, an `ESchema` named `'Settings'`, saved as a single entity,
  with `theme`. Its theme, as a `ValueESchema`: free text in v1, then
  `'light' | 'dark'` in v2.
- The table is `StdTable.make('board').primary('pk', 'sk').build()`. Task is
  bound with `.primary({ pk: ['boardId'] })`. The board people use is
  `'work'`.
- Example titles: 'Plan the week', 'Water the plants', 'Call home'.

A page shows only the versions it needs.

## A page

Its shape, in order:

1. **Where we are.** One or two sentences that pick up from the last page,
   and the problem this page solves, in plain words.
2. **A Picture**, early, that shows the idea move. Its caption says what to
   watch.
3. **The idea**, in the fewest words, then the smallest code that shows it.
   One idea per section. Short code excerpts, each followed by what it does
   and why.
4. **See it run.** A `<Run>` whose program logs what happens behind the
   scenes: the value in your code, the encoded form that is stored (with its
   `_v`), what a read gives back. The console's values open and fold, so log
   whole objects rather than strings about them. Or a `<LiveTable>` where
   pressing buttons teaches it better.
5. **Remember.** One `<Callout title="Remember">`: the page's rule.
6. **Next.** One sentence that hands over to the next page with its
   question.

Keep it light:

- About 15 words a sentence; one idea a paragraph; `##` sections of a few
  paragraphs each.
- No lists of five terms at once. A term is **bold** where it is defined,
  once.
- Say why before how. Every API on a page answers a problem the page has
  already shown.
- No jargon a newcomer to std-toolkit would not know; Effect basics
  (`Effect`, `Schema.String`) are assumed, nothing else.
- A page that runs past about 120 lines of MDX is two pages.
