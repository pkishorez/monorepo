# code actor tree

`code` runs Claude Code and Codex Sessions in Projects, on every Connection of
an Account at once. The folders under `src/app/` tell one story, top down.
Each level has at most three parts. Read it depth first: a part, then what is
inside it, then the next part.

`pnpm tree` checks the shape: a folder holds at most three parts, and every
test sits in a `tests/` folder beside what it tests. `pnpm lint:laymos`
checks who may import whom (`laymos.config.json`). A part is a child folder,
or a file that is not the folder's own (`index`, `actor`, `store`, `view`,
`commands`, and the file named as the folder).

## Addresses

Every page is one Account's. The address says whose it is.

| Address                                                   | Page                                |
| --------------------------------------------------------- | ----------------------------------- |
| `/a/:accountId`                                           | home: every Connection's Projects   |
| `/a/:accountId/settings`                                  | Settings, four tabs with no address |
| `/a/:accountId/m/:connectionId/p/:projectId`              | a Project, and a new Session in it  |
| `/a/:accountId/m/:connectionId/p/:projectId/s/:sessionId` | a Session                           |

`/`, and the addresses the app had before (`/settings`, `/m/…/p/…`), go to
the same page under the Account active. Only the root page reads them
(`app/app.ts`). Any other address, one under `/a/:accountId` included,
names no page: the root page draws a 404, whoever is signed in, "Nothing
lives at this address", with "Go home" to `/`, as the router matches a
whole address or none.

## The story

### `start.tsx`

Kabuki Start draws the app: the router, the root page's View, the Document,
and what lives as long as the page. It gives `Accounts` (who is signed in),
`CloudClient` (Cloud Connect), `Preferences`, `Storage` and `OnOutdated`.

### `app/` ◆ the root page

The root page asks who is signed in. It is in one State at a time:
`Reading`, `Checking`, `SignedIn` or `SignedOut`. It puts `/` and an old
address under the Account active. Put there while the Auth Worker was
still asked, under the Account this device kept, the address was its
guess, not the user's: once the Auth Worker answers another, it goes,
saying nothing, to the same page under that one. It never moves an
address the user opened. Once the Auth Worker answers, it deletes what
this device keeps of an Account no longer signed in. It gives
`CurrentAccount`, and has the Account Switcher as a Child.

1. **`storage/`**: what this device keeps.
2. **`sign-in/`**: what is drawn in place of the app: the mark, checking,
   and the one sign-in screen, "Continue with Google", which goes to
   Google at once (`sign-in.tsx`); on an Account's page, why its Account
   is not drawn, and the Accounts signed in here to switch to
   (`away.tsx`); and the 404 (`nowhere.tsx`).
3. **`account/`** ◆: the Account's page, `/a/:accountId`.

### `app/storage/`

What this device keeps, as one Capability, `Storage`, and the
`Preferences`. `start.tsx` gives both. `storage.ts` tells the story: each
store is one of three kinds (Local, Cache, Sync); a level prunes what it no
longer lists; what the user asks to go goes at once (`forget`). The sync
Stores, one per Connection, are made here too.

1. **`local/`**: what only this device knows: `device/` (the device's own
   database: the Preferences, and auth-toolkit's `Accounts` with the
   Accounts signed in here), `seen/` (the Unseen marks) and `drafts/` (the
   Saved Drafts).
2. **`cache/`**: copies of what Cloud Connect and each Connection last
   said, and how a holder's Model follows one (`copy.ts`).
3. **`database/`**: the name of each database by its place, and how every
   store keeps its rows. It is the one part the other two use.

### `app/account/` ◆ the Account's page

The page of one Account. A tab acts only as the Account active, so the page
is in one of two States:

- `Away`: the Account is not the one active. It draws one screen, the
  sign-in screen, with a line saying why: its Account is signed out, here
  or in another tab; another tab or app switched to another, or added
  one; the link is for an Account signed in here, another active; or for
  one not signed in on this browser. Under it, "Continue with Google", and
  the Accounts signed in on this browser to switch to. While the Auth
  Worker is still asked, it says it is checking.
- `Active`: the app. It reads the Connection List, kept first, then from
  Cloud Connect, and rechecks it while a Connection is down.

It never switches, nor moves, by itself. It moves, drawing the mark
meanwhile, only for what was asked in this tab: a switch from the header's
Account Switcher goes to the new Account's home; choosing another Account
on the sign-in screen switches and goes to its home; choosing its own
switches and stays. Signing in from here comes back to the page; an
Account added from the Account Switcher comes back to `/`, which the root
page places under it.

It gives `Connections` (the list, each Connection's link, setup, Unseen
marks, Agent Questions and Background Jobs, through `account.ts`),
`CodeClients` and `Replicas` (each Connection's socket and records), `Moves`
and `Voice`, in every State, so the pages find them.

1. **`connection/`** ◆: one per listed Connection.
2. **`frame/`** ◆: what is drawn around every page.
3. **`pages/`**: the page the address names.

### `app/account/connection/` ◆

One Connection. It keeps its setup, reads its Unseen marks, opens its own
sync Store and socket, and says all of it through `Connections`. Its
Replicas run over its own Store.

It owns the one socket to its Connection, opened in its own scope as it
starts and closed as it stops: as the Account leaves `Active`, or the
list leaves the Connection out. So no socket of an Account is open
outside `Active`. Everything else borrows it while it runs.

1. **`link/`**: how it is reached: `reach/` (its socket, at the code
   Plugin's Release this Code was built with, what opens it, `Sockets`,
   how the pages borrow it, `borrow.ts`, and who is behind when it runs
   another), `health/` (how it stands) and `refusal/` (why a call was
   refused).
2. **`records/`**: what it holds: Projects, Sessions and messages;
   `questions/` (the Agent Questions its Turns wait on), `jobs/` (its
   Background Jobs) and `moves/` (each Move on its way).

### `app/account/frame/` ◆

What is drawn around every page while the Account is `Active`: the
sidebar, the header and the Pickers. It holds the keys, Vim Mode, the
Window and the Text Size, and gives `ConnectionFilter` (`store.ts`).

The keys, every Surface and Action of the app, stay in `commands.ts`, the
one file of its own a folder may hold besides its Actor and View, though
they are not the frame's Commands. The frame holds three parts already,
and so does every folder above it that the pages and `src/ui/` could both
reach, so a `keys.ts` in any of them would be a fourth part. The Picker and Confirm, in `src/ui/controls/`, bind them as
two Exceptions.

1. **`sidebar/`** ◆: the Projects and Sessions of the Connections shown:
   `list/` (its rows in `order/`, the Settled List in `settled/`, and a row
   swiped to Settle in `swipe/`), `bars/` (its `header/` and, on a phone,
   its `foot/`) and `prefetch/` ◆ (the messages of every Session shown,
   synced before it is opened).
2. **`header/`** ◆: where you are, from the rows of the project and the
   session the URL names (`header.tsx`, with the Connection's pills), and
   `voice/` ◆, recording from anywhere, which lives as long as the header,
   around every page: `dictation/` ◆ (the one Dictation, and its Takes),
   `microphone/` ◆ (the Microphone Picker) and `recorder/` (the browser's
   microphone, which the other two use). Voice gives `Recorder`; the
   header shows its cancel while a Dictation is going.
3. **`pickers/`** ◆: what the keys open: `projects/` ◆ (the Project
   Picker, and the folders it lists), `sessions/` ◆ (the Session Switcher)
   and `actions/` ◆ (Actions).

### `app/account/pages/`

One page at a time, from the address.

1. **`home/`** ◆: every Connection's Projects.
2. **`project/`** ◆: a Project. It gives its Connection's `CodeClient`,
   borrowed from the Connection while it runs, and its Catalog (agents, models, Skills). With no Session open, it draws a new
   one over its Draft; started, the Draft hands the Session over, and stays
   drawn until the Session's page can be drawn whole. Its parts: `draft/` ◆
   (`write/` ◆, its Draft Modes, with `touch/` ◆, the Touch Draft;
   `choose/` ◆, its Pickers; and `send/`) and `session/` ◆ (`transcript/`
   ◆, its row, its messages and the Running Picker over them; `scroller/`;
   and `panels/`: the Session details and the Question Panel ◆).
3. **`settings/`** ◆: `browser/` (General, Shortcuts and About, what this
   browser keeps) and `cards/` ◆ (the Connections tab: one `card/` ◆ per
   Connection, with its `agents/` ◆, each agent's Harness Accounts, one
   `card/` ◆ each, and its `speech/` ◆, Speech to Text).

A page is kept whatever the Account's State, so the project and the
session read their Connection, and ask it anything of their own, only
while it runs here, the Account the one active and listing it
(`Connections`). The project holds no socket: each call and stream it
makes borrows its Connection's, waiting while the Connection does not
run. A Query whose Replica Instance stopped never reads again, so each
time the Connection runs here again, the page's own Queries start over,
keyed by how many times it ran (`records.ts`, `readingOf`).

`src/ui/` holds plain parts with no data: `page/` (devtools, gutter, theme),
`controls/` (notices, the Picker, settings rows) and `labels/` (agent, path,
status).

## Actors

```
App                         root page · Reading | Checking | SignedIn | SignedOut
├── account                 the Account Switcher (library Actor)
└── Account                 page /a/:accountId · Away | Active
    ├── connection          each: listed Connection id · while Active; owns its socket
    │   └── replicas        its Connection's Replica Instances
    ├── frame               while Active, once its keys are read
    │   ├── sidebar
    │   │   ├── projects, sessions  each: shown Connection id (Queries)
    │   │   └── prefetch
    │   │       └── messages  each: shown Session id (a MessageIds Query)
    │   ├── header
    │   │   ├── project     while the URL names one (a ProjectRow Query)
    │   │   ├── session     while the URL names one (a SessionRow Query)
    │   │   └── voice
    │   │       ├── dictation
    │   │       └── microphone  the Microphone Picker
    │   └── pickers
    │       ├── projects    the Project Picker, as one of `Picker.make`
    │       ├── sessions    the Session Switcher, as one of `Picker.make`
    │       └── actions     Actions
    └── pages               one at a time, from the address
        ├── Home
        │   └── projects    each: shown Connection id (Queries)
        ├── Settings        general, shortcuts, and cards
        │   └── cards       the Connections tab
        │       └── card    each: listed Connection id
        │           ├── agents   its Harness Accounts, by agent
        │           │   └── card each: a Harness Account open
        │           └── speech   its Speech to Text
        └── Project         the Catalog; the Handover of a Session its Draft started
            ├── project     its row (a ProjectRow Query); key: its Connection's runs here
            ├── draft       while no Session is open, or the one it started is not yet drawn whole
            │   ├── modes   each: a Draft Mode (Message, Btw), the Actor `write`
            │   │   └── touch  the Touch Draft
            │   └── choose  the skills, model and Branch Pickers, one open at a time
            └── Session     …/s/:sessionId
                ├── transcript   key: its Connection's runs here
                │   ├── session   its row (a SessionRow Query)
                │   ├── messages  each: its own, and each session up its fork chain (Queries)
                │   └── running   while open (the Running Picker)
                ├── draft     key: the session id
                └── question  key: the session id; the Question Panel
```

Every Picker made by `Picker.make`, every Replica Query and the Account
Switcher come from a library or a factory, and have no folder of their own.
`pages` is one kind of Child: one page at a time, named by the address.

No Actor has more than three kinds of Children. Three sit between a parent
and the Children that crowded it, and only hand on its Props: `pickers`
(the frame's Pickers), `choose` (the Draft's) and `transcript` (the
session's Queries and its Running Picker). The Pickers under `choose` and
`transcript` still answer the Actor that gives their owner, the Draft or
the session, which keeps which one is open. Each of the three hands what
it holds to its parent's View through `Around`.

Each Actor is named as its folder: `Projects` and `Sessions` hold the
Project Picker and the Session Switcher, `Write` the Draft Modes, `Touch`
the Touch Draft, `Choose` the Draft's Pickers, `Cards`, `Card`, `Agents`
and `Speech` the Connections tab, and `Prefetch` what the sidebar syncs
ahead. The words of `CONTEXT.md` name what they hold.

## Capabilities

Each is given by its owner, and reaches every Actor below it. An owner's
`provides` names the Capabilities beside the Layer that builds them, and
only those named reach below: a Picker's, the Touch Draft's and the Draft
Modes' owners name theirs as `capabilities`, beside `owner`.

| Given by         | Capabilities                                                                     |
| ---------------- | -------------------------------------------------------------------------------- |
| `start.tsx`      | `Accounts`, `CloudClient`, `Preferences`, `Storage`, `OnOutdated`                |
| `app/`           | `CurrentAccount`                                                                 |
| `account/`       | `Connections`, `CodeClients` (borrowed), `Replicas`, `Sockets`, `Moves`, `Voice` |
| `connection/`    | its own `Replicas` and socket, to its Instance                                   |
| `frame/`         | `ConnectionFilter`                                                               |
| `header/voice/`  | `Recorder`                                                                       |
| `pages/project/` | its Connection's `CodeClient` (borrowed), the Catalog, the Handover              |

## Links between parts

A parent uses its children. Each other link is a Rule in
`laymos.config.json`, and its reason is here. Most are a child reading what
an ancestor gives, as Kabuki has it: a Capability, or the keys.

| From                                   | To                                    | Why                                                                  |
| -------------------------------------- | ------------------------------------- | -------------------------------------------------------------------- |
| `storage/local`, `storage/cache`       | `storage/database`                    | the names of the databases, and how every store keeps its rows       |
| `account`                              | `app.ts`, `storage`, `sign-in`        | the addresses; what this device keeps; the sign-in screen while Away |
| `account/connection`, `frame`, `pages` | `account/account.ts`                  | `Connections`, which the Account's page gives                        |
| `account/frame`, `pages`               | `account/connection`                  | how a Connection stands, and its records                             |
| `frame/sidebar`, `frame/pickers`       | `frame/commands.ts`, `frame/store.ts` | the keys, and `ConnectionFilter`, which the frame gives              |
| `frame/header`                         | `frame/pickers`                       | a session's title, pulsing while Actions writes it again             |
| `pages`                                | `frame/commands.ts`, `header/voice`   | the keys; a field's Dictation, through `Voice`                       |
| `voice/dictation`, `voice/microphone`  | `voice/recorder`                      | the browser's microphone, which both use                             |
| `voice/dictation`                      | `voice/voice.ts`                      | `Voice`, which the Account's page gives                              |
| `connection/records`                   | `connection/link`                     | a call refused, and why                                              |
| `link/health`                          | `link/reach`                          | who is behind, to say how a Connection stands                        |
| `project/draft`                        | `project/store.ts`                    | the Catalog, which the project gives                                 |
| `project/session`                      | `project/draft`                       | a Session's own Draft                                                |
| `session/transcript`                   | `session/scroller`, `panels/details`  | the column it scrolls in; a turn's facts, shown in its footer        |
| `transcript/tool`                      | `transcript/words`, `turns/rows`      | words drawn in a tool's output; the rows it is drawn from            |
| `settings/cards/card`                  | `cards/store.ts`                      | the cards, which Cards gives                                         |
| `agents/card`                          | `agents/store.ts`                     | the Harness Account list, which Agents gives                         |

Two Exceptions: the Picker and Confirm, in `src/ui/controls/`, bind the
app's own keys, defined with every other key in `frame/commands.ts`.

## First draw

The app is drawn whole, in one step, from what this device holds. Until
the frame is shown, the mark stays and the frame draws nothing. The sidebar
and the page each say once, from their View, that all they first draw is
read (`Ready`): the sidebar its width, the Connections collapsed, and the
rows and marks of every Connection shown; the page its own (home its
projects; a project its row and the new session's Saved Draft; a session
its row, messages and Saved Draft). With the header's rows and the page's
code loaded too, the frame is shown. Nothing waits on Cloud Connect or a
Connection: what they answer comes in behind.

## Moving between pages

A move to a page swaps the screen at once: the page moved to draws what it
has read so far, and the rest arrives in its first frames. An Account
switch asked here goes to the new Account's home, a page of its own; one
made elsewhere, or a sign-out, moves nothing: the page says why. The
page code, and the views that say a page is ready, are preloaded once the
browser is idle, so a move never waits on React's Suspense.

## Voice

Voice is a Child of the frame's header, drawn around every page, so a
recording keeps going across pages. Its asks go through `Voice`, which the
Account's page gives, so a page's field can ask too.

- Each recording has an Owner, the field it was started from: a Draft, by
  its Session, or a question's own answer, by its Item. A field's mic
  starts one for itself; Space and Ctrl+Space start one for the field
  focus is in, else the Draft on screen. The frame binds the keys.
- You stop it from anywhere, and its text still goes to its Owner. Until
  the Owner is drawn again, the text waits for it.
- The header shows a cancel while one is going, which throws it away.
- A field holds no recording logic. It asks `Voice.useDictation`, or
  draws `Voice.Field`, for its own: it shows only the one recording for
  it, and while one goes for another field its mic waits.

## Releases

Code is built with one Release of the code Plugin, `PLUGIN_CODE`, which
Vite inlines as `import.meta.env.PLUGIN_CODE` (`scripts/plugin-code.ts`):
the latest in the Plugin's Release Log, and the build fails without one;
under `pnpm dev`, the sha256 of Connect's own `dist/plugin/code.mjs` when
it is built, as the dev Worker names it. Each Connection's socket dials
`<tunnel>/code/<sha256>/rpc` (`connection/link/reach/`).

A Connection running another Release closes the socket at once with
`PLUGIN_MISMATCH`. Connect's client keeps what it said until a socket to it
is answered, and the Link is relinking until then, though the socket
opened. The Account's page holds it as `mismatched`, per Connection, beside
its Link, and what Cloud Connect wants it to run says who is behind
(`release.ts`):

- **Updating**: Cloud Connect wants this Code's Release, or names none. The
  socket keeps retrying, with its own backoff, and Cloud Connect is
  rechecked as for any Link down; the header's pill says "Updating
  Connect…". The first socket answered ends it.
- **Stale**: Cloud Connect wants another. This Code moves to its newest
  build (`OnOutdated`), once, as it turns Stale; the pill says "Updating
  Code…".

## Sync of what the sidebar shows

The sidebar's `prefetch` holds one `MessageIds` Query per Session it shows. Its
`where` on the Session opens that Session's Window, so its messages sync
over the Connection's one socket, and resume after a reconnect. The Query
selects only ids, so its Model and the Kabuki History stay small. Opening
the Session then draws its messages from this device at once.

## Storage

Each level names its own database (`storage/database/`). The names stay as
they were.

| Database                                                         | Table                      | Kind  | Written by                |
| ---------------------------------------------------------------- | -------------------------- | ----- | ------------------------- |
| `code:device`                                                    | `accounts`                 | Local | Accounts (auth-toolkit)   |
|                                                                  | `preferences`              | Local | Preferences               |
| `code:account:<accountId>`                                       | `connections`              | Cache | the Account's page        |
|                                                                  | `sidebar`                  | Local | the Connection Filter     |
| `code:account:<accountId>:connection:<connectionId>`             | `setup`, `skills`          | Cache | connection, project       |
|                                                                  | `seen`                     | Local | session                   |
|                                                                  | `drafts`                   | Local | draft                     |
| `code:account:<accountId>:connection:<connectionId>:sync:<name>` | Projects, Sessions, Turns… | Sync  | the Connection's Replicas |

Local is known only here and is the truth. Cache is a copy of what Cloud
Connect or a Connection last said: shown first, replaced by the next answer.
Sync is a copy the backend keeps live. Every store but the Preferences is
reached through `Storage`.

Who prunes, and only on a real answer (a check that fails deletes nothing):

| Who                | When                                   | Prefix                          | Keeps                        |
| ------------------ | -------------------------------------- | ------------------------------- | ---------------------------- |
| the root page      | the Auth Worker answers, or a sign-out | `code:account:`                 | every Account signed in here |
| the Account's page | Cloud Connect first answers            | `code:account:<id>:connection:` | the Connections it lists     |

A Project removed and a Connection forgotten are your asks, and go at once
(`Storage.forget`).

## Agent Questions

An agent's question is followed once, by its Connection, and read twice.

- **Connection** (`connection/records/questions/`) follows every Session's
  Agent Questions over its own socket, whole on each change, and says
  them in `Connections`, beside its setup and Unseen marks. Nothing of them
  is kept: they live only while their Turn runs. It also holds how each
  is being answered here (`Answering`: each Item's answer so far,
  minimised or not, tried, sent), in memory, as the Question Panel gives
  it, and lets it go with the question when the question leaves its
  feed; never on storage, as an answer may be a secret. In development a
  session's address with `?question=single`, `mixed`, `secret` or `long`
  adds a sample, answered in the browser (`samples.ts`).
- **Sidebar** reads which Sessions ask, for their "Question" pill.
- **Question Panel** (`pages/project/session/panels/question/`), a Child of
  the Session, reads its own Session's, reads back from the Connection how
  they were being answered as it opens and gives it each change, so leaving
  the session or the page and coming back finds each question as it was
  left, and answers or declines it over the page's socket; one no longer
  asked is as good as answered. Its parts: `answer.ts` (an answer as it
  is given), `dialog/` (expanded: a dialog of one Item a step, the
  `question` Surface inside the page's; `step.tsx` draws an Item,
  `keys.ts` its keys, `sheet.ts` its touch sheet) and `bar.tsx`
  (minimised). Which step is shown, whether one's own answer is being
  typed, and whether skipping waits on a second ask are the dialog's
  alone, not kept. The page draws it in the Draft's place, and no Draft
  at all while it stands in, so nothing reaches the Draft; expanded, it
  is drawn over the transcript, which is dimmed and `inert` under it.
  The sidebar and the header are outside it, and work as ever.
