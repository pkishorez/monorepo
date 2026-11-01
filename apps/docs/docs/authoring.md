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
    ├── core                a Part: a section named and pathed as its package is
    │   ├── One Actor       a group: a small title over at most three pages
    │   ├── Many Actors
    │   └── Over time
    ├── react · routing · start
    └── Demos               grouped Small, Apps, Showcase; the full-screen one opens in a new tab
```

- **Toolkit.** One per package or group of packages. It is listed in
  `src/shared/content/toolkits.ts` with one word for what it is (`kind`) and a
  one-sentence `pitch`. It gets a door on the home page, a landing page and a
  sidebar. A toolkit is added only once it has pages to read: no "coming
  soon" toolkits.
- **Section.** A heading in a toolkit's sidebar. kabuki's are Get started,
  its four Parts in the order they are read (core, react, routing, start,
  each using only the ones before it), and Demos. A Part's section carries
  its import path, which its pages show above their title.
- **Group.** The pages of a section read together, under a small title of
  their own or none: at most three, so the reader holds one group at a time.
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
    get-started/                       one folder per section: get-started, core, react, routing, start, demos
      quick-start/                     one folder per page, named by its slug
        quick-start.mdx                the page's words
        components/                    what only this page uses
          counter.ts                   the Actor its demo runs
          counter-app.tsx              its View and `View.app`: the live app the page shows
        run/                           what a core page runs in its console
          counter.ts                   exports `program`
```

- A page is one folder: its MDX, named after its slug, and a `components/`
  folder for everything only it uses. Nothing in `components/` is imported by
  another page. A demo the pages of one Part share lives in a folder named
  for it under that Part, beside its pages, as routing's `shop/` does. A
  component pages of different Parts need moves to `src/client/components`.
- The title and the one-line summary are in the table of contents, not in the
  MDX. The page draws them above its words, and the server uses them for the
  page's metadata.
- Only written pages are in the table of contents: no placeholders, no
  "soon". Every page in it is registered in `kabuki.ts`, or it does not
  compile.

## Adding a page

1. Add it to its section and group in `src/shared/content/kabuki.ts`:
   `slug`, `title`, `summary`.
2. Make its folder, `src/client/docs/kabuki/<section>/<slug>/`, with
   `<slug>.mdx`.
3. Register it in `src/client/docs/kabuki/kabuki.ts`.

## A Part's page

The four Parts are one story, told in order, each page building on the
last: core (Actor, State machine, Workers; Children, Props, Capabilities;
History), then react (View, App), routing (Pages, Moving, Data) and start
(Serving, Your app, Platforms). Each page explains one idea as a concept
first, and the code second.

- **Open with the idea, in React's words.** Say what the reader already
  knows from React (a component, conditional rendering, `useEffect`,
  props, context) and how the kabuki twin differs. Pick up where the last
  page left off.
- **A picture early.** An animated drawing of the idea, in a `<Picture>`
  with a caption that says what to watch.
- **Show, don't list steps.** Walk through how each piece looks, a short
  code excerpt at a time, and say why it is that way. Number steps only
  when the reader really does them in order, as on the Actor page.
- **Run it.** On a core page, the Actor run with no screen at all, in a
  `<Run>`: the reader presses Run and reads what it logs.
- **Try it.** The real app in a `<Live>`, with its files as tabs. Children,
  Props and Capabilities share one playlist that grows from page to page.
- **Remember.** The one rule of the page, in a `<Callout title="Remember">`.
- **Next.** One sentence that hands the reader to the next page, with its
  question.

Write it the way you would explain it to a friend:

- Conversational: "you", contractions, short questions the reader would
  ask. Never dry.
- Sentences of about 15 words or fewer. One idea per paragraph.
- A term of kabuki's language is **bold** the first time a page uses it,
  in the words of `packages/kabuki/CONTEXT.md`.
- Everything in kabuki is declarative: say what is written down, not what
  to call.

## Pictures

A picture is a small animated drawing, built from `src/client/components`'
picture parts: `useSteps` to loop through still steps, `Box`, `Pill`,
`Message`, `Roll`, `Flash` and `Cursor`. It lives in its page's
`components/` folder. One thing moves at a time; each step is a cause and
what it changes. With reduced motion it holds one step that tells the
whole idea. It works on a phone.

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
  - Every example is one of three, each with a `caption` under it that says
    what to try and what to notice. Code blocks inside one that include a
    file become tabs, all one fixed height. Leave a blank line around each
    block:

    ````mdx
    <Live app={CounterApp} caption="…">

    ```ts file=./components/counter.ts

    ```

    </Live>
    ````

  - `<Picture caption="…">` frames an animated picture, with its progress
    along the bottom edge and a button to play it again.
  - `<Live app={App} url? devtools?>` runs an app made with `View.app` in a
    window, its code in tabs beside it. The kabuki devtools sit under it,
    closed behind the window's Devtools button; `devtools` opens them from
    the start, for a page about going back in time. `url` names the window,
    `tall`, `site` and `keys` are for games and whole sites.
  - `<Run program={program}>` shows the file that exports `program` and a
    console under it. Run starts the program with Effect's `Console` writing
    to that console: each line timed, a Message drawn as its tag and fields,
    and what the program returns last. It is core's way to show an Actor
    before anything draws it.
  - `<Files>` lists the code behind a demo page as a tree.
  - `<Callout title="…">` is a note beside the text. Use one per page, for
    Remember.

## Live demos

A demo is the page's own kabuki app, in its `components/` folder:

- The Actor in a `.ts` file, the View and `View.app` in a `.tsx` file, so the
  page can show each with `file=`.
- The MDX imports the app and hands it to `<Live>`. A core page also runs
  its Actor in a `<Run>`, from a `run/` file that starts it with
  `Runtime.start`, sends it Messages and logs with `Console.log`.
- `View.app` takes a `name` unique on the site, such as `docs:introduction`,
  when its root Actor's name could clash with another demo's.
- It draws on the server first: nothing in it may read `window` while
  rendering.
- It works on a phone: one column below the `sm` width.

## Checks

```bash
pnpm --filter docs lint   # types, including the registry of written pages, and the layer rules
pnpm --filter docs test   # every link from a page to the site names a page
```
