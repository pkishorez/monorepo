# Writing the docs

How the site is organized, and how to write one page of it. Read this before
adding or changing any page under `src/client/docs`.

## The shape of the site

```
ke stack                    the home page: one line, then a door per toolkit
└── kabuki                  a toolkit: its landing page at /kabuki
    ├── Get started         a section: a heading in the sidebar
    │   ├── Introduction    a page: /kabuki/introduction
    │   └── Quick start
    ├── Tutorial: …         a series: its pages are numbered chapters
    ├── Concepts            one idea per page
    ├── Guides              one task per page
    ├── Examples            whole apps, running
    └── Why kabuki          the decisions, and comparisons
```

- **Toolkit.** One per package or group of packages. It is listed in
  `src/shared/content/toolkits.ts` with one word for what it is (`kind`) and a
  one-sentence `pitch`. It gets a door on the home page, a landing page and a
  sidebar. A toolkit is added only once it has pages to read: no "coming
  soon" toolkits.
- **Section.** A group of pages in a toolkit's sidebar. Every toolkit uses the
  same sections, in the same order, and leaves out the ones it has nothing
  for: Get started, Tutorial, Concepts, Guides, Examples, Why.
- **Page.** One URL, `/<toolkit>/<slug>`. A slug is unique in its toolkit, so
  a page can move between sections without its URL changing.

## Names

Every name we own is lowercase, everywhere, even at the start of a sentence
or a title: `kabuki`, `ke stack`, `kabuki start`. Never `Kabuki`. Labels are
never styled `uppercase` for the same reason. Terms of a toolkit's own
language keep their capital, as its code and `CONTEXT.md` write them: Actor,
Message, State, Model, Worker.

## Where a page lives

The table of contents is TypeScript; the words are MDX.

```
src/shared/content/kabuki.ts           the table of contents: sections, pages, titles, summaries
src/client/docs/
  kabuki/
    kabuki.ts                          every written page, by slug
    get-started/                       one folder per section
      quick-start/                     one folder per page, named by its slug
        quick-start.mdx                the page's words
        components/                    what only this page uses
          counter.ts                   the Actor its demo runs
          counter-app.tsx              its View
          playground.tsx               the live demo the page shows
```

- A page is one folder: its MDX, named after its slug, and a `components/`
  folder for everything only it uses. Nothing in `components/` is imported by
  another page. A component two pages need moves to `src/client/components`.
- The title and the one-line summary are in the table of contents, not in the
  MDX. The page draws them above its words, and the server uses them for the
  page's metadata.
- A page not written yet is marked `soon` in the table of contents, with an
  `outline` of the headings it will have. Once written, take `soon` and
  `outline` out and register its MDX in `kabuki.ts`; it does not compile until
  every page not marked `soon` is registered.

## Adding a page

1. Add it to its section in `src/shared/content/kabuki.ts`: `slug`, `title`,
   `summary`.
2. Make its folder, `src/client/docs/kabuki/<section>/<slug>/`, with
   `<slug>.mdx`.
3. Register it in `src/client/docs/kabuki/kabuki.ts`.

## Writing the MDX

- **Start with the point.** No `#` title; the page has one. Open with a
  paragraph that says what the reader will know or have by the end.
- **Headings.** `##` for the parts, `###` under them, nothing deeper. Each
  becomes an entry in "On this page", with an id made from its words, so
  renaming one breaks links to it.
- **Short.** One idea per section. Plain words. Say what something does
  before how it is built.
- **Code that runs.** A block that shows a file a demo runs includes that
  file, so the two never drift:

  ````md
  ```ts file=./components/counter.ts

  ```
  ````

  A block written by hand is for code the reader types that no demo runs,
  such as an install line.

- **Links.** Plain Markdown. A link to the site is its path,
  `[Quick start](/kabuki/quick-start)`; the page draws it as a Router link,
  and `pnpm test` fails if the path is not a page.
- **Built-in components**, used without importing them:
  - `<Demo caption="…">` frames a live example. The caption says what to try
    and what to notice. Code blocks inside it that include a file become
    tabs beside an Output tab, all one fixed height, so the reader sees every
    file the example runs. Leave a blank line around each block:

    ````mdx
    <Demo caption="…">

    <Playground />

    ```ts file=./components/counter.ts

    ```

    </Demo>
    ````

    A live example inside a tabbed Demo fills its height and scrolls inside
    itself, so pressing it never moves the page.

  - `<Callout title="…">` is a note beside the text. Use one rarely.

## Live demos

A demo is the page's own kabuki app, in its `components/` folder:

- The Actor in a `.ts` file, the View and `toReact` in a `.tsx` file, so the
  page can show each with `file=`.
- Anything around it, such as a panel showing the State, the Workers or the
  Messages, in its own component, which the MDX imports and puts in a
  `<Demo>`.
- `toReact` takes a `name` unique on the site, such as `docs:introduction`,
  when its root Actor's name could clash with another demo's.
- It draws on the server first: nothing in it may read `window` while
  rendering.
- It works on a phone: one column below the `sm` width.

## Checks

```bash
pnpm --filter docs lint   # types, including the registry of written pages, and the layer rules
pnpm --filter docs test   # every link from a page to the site names a page
```
