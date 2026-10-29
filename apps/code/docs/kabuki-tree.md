# code actor tree

`code` runs Claude Code and Codex Sessions in Projects, on every Connection of
the signed-in Account at once. The folders under `src/device/` tell one
story, top down, and each level holds at most three parts. Read it depth
first: a part, then what is inside it, then the next part.

`pnpm tree` checks the shape: a folder holds at most three parts, and every
test sits in a `tests/` folder beside what it tests. `pnpm lint:laymos`
checks who may import whom (`laymos.config.json`).

## The story

1. **Device** (`device/`) opens first. It reads this device's database,
   `code:device`: the Preferences and the Accounts signed in here. It gives
   the Preferences to everything below. It also holds `kabuki/` (the
   `/kabuki` page) and `routes/` (the address of every page).
2. **Account** (`device/account/`) asks: is there an active Account? If yes,
   it draws the app as that Account at once and checks with the Auth Worker
   in the background. Signed out from elsewhere, its data is pruned and
   sign-in shows (`sign-in/`). On an Account switch, the old screen stays
   until the new Account's Connections are ready. It prunes `code:account:`
   once the Auth Worker really answers, keeping the Accounts signed in.
3. **Connections** (`device/account/connections/`) reads the Account's Connection
   list and sidebar filter from `code:account:<id>`. It asks Cloud Connect
   for the list and prunes `code:account:<id>:connection:` on the first real
   answer. It has three parts:
   1. **connection/**: one per Connection. Its link (how it is reached,
      at the code Plugin's Release this Code was built with, and who is
      behind when the Connection runs another; its health; why a call was
      refused), its records (Projects, Sessions,
      messages, Moves on their way, and the Agent Questions its Sessions
      wait on, `records/questions/`), and its store (setup, Skills,
      Unseen marks, Saved Drafts, sync).
   2. **voice/**: recording from anywhere. The Dictation, the recorder and
      the Microphone Picker. One per Account, so it keeps recording while
      you move between pages.
   3. **layout/**: what you see. Its view draws the header. It has three
      parts:
      1. **sidebar/**: the Projects and Sessions of the Connections shown.
         `session-sync/` keeps the messages of every Session shown in
         sync, before you open it.
      2. **pickers/**: what the keys open. `projects/` (Project Picker and
         folder Picker), `sessions/` (Session Switcher), `actions/` (what
         you can do here, each with its keys).
      3. **pages/**: one page from the URL: `home/`, `project/`,
         `settings/`.
         - `project/` (`/m/:connection/p/:project`) owns the Catalog (agents,
           models, Skills) and gives it down. Its parts: `draft/`,
           `new-session/` (a Draft that starts a Session) and `session/`
           (`…/s/:session`).
         - `draft/` keeps the text, files and choices, and the saved
           Draft. Its parts: `write/` (editor, attachments, touch mode),
           `pick/` (agent and model, Skills, and a new session's branch and
           New Worktree toggle) and `send/` (message, side question, and a
           new session's Starting: its steps, streamed by a Worker, drawn
           where the transcript will be). Started, the Draft hands the
           Session over to `project/`, which keeps the Draft drawn until
           the Session's page can be drawn whole, so no blank comes
           between them.
         - `session/` holds the Session's row, its fork history, Stop,
           Fork and Seen; `transcript/` draws its turns, tool calls and
           words; `question/` is the Question Panel, which stands in for
           the Draft while its agent asks.
         - `settings/` has `general/`, `shortcuts/` and `connections/` (one
           card per Connection: its Agents, accounts and speech).

`src/ui/` holds plain parts with no data: `page/` (devtools, gutter,
theme), `controls/` (notices, the Picker, settings rows) and `labels/`
(agent, path, status).

## Actors

The actor tree follows the folders, with one difference: Layout and the
pages are Children of the Device, not of Connections. The Connections of two
Accounts run at once while one prepares, and Layout starts over for each
Account drawn, which a Child of one Connections could not do.

```
device                          root page; States: Reading | Checking | SignedIn | SignedOut
├── account                     the Account Switcher (library Actor)
├── connections                    each: the Account drawn, and the one about to be; follows each listed Connection's Link and mismatch
│   ├── voice                   always
│   │   ├── dictation           always; hears asks only while its Account is drawn
│   │   └── microphonePicker    always
│   └── connection                 each: listed Connection id; follows its Agent Questions and their answers so far
│       └── replicas            its Connection's Replica Instances
├── layout                      key: the Account drawn
│   ├── sidebar                 always, on a phone too while it is shut
│   │   └── sessionSync         always
│   │       └── messages        each: shown Session id (a MessageIds Query)
│   ├── pickers                 always: projects, sessions, actions
│   └── project, session        the rows the header names
└── pages                       one at a time, from the URL
    ├── Home
    ├── Settings                general, shortcuts, connections (one card each)
    ├── Project                 the Catalog; the Handover of a Session its draft started
    │   ├── draft               while no Session is open, or the one it started is not yet drawn whole
    │   └── Session             /s/:sessionId
    │       ├── draft           key: the session id
    │       └── question        key: the session id; the Question Panel
    └── Kabuki                  /kabuki
```

Every Picker made by `Picker.make`, every Replica Query and the Account
Switcher come from a library or a factory, and have no folder of their own.

## First draw

The app is drawn whole, in one step, from what this device holds. Until
Layout is shown, the root page's mark stays and Layout draws nothing; the
sidebar and the page each say once, from their View, that all they first
draw is read (`Ready`): the sidebar its width and the rows and marks of
every Connection shown, the page its own (home its projects; a project its row
and the new session's Saved Draft; a session its row, messages and Saved
Draft). With the header's rows and the page's code loaded too, Layout is
shown (`Ready`). Nothing waits on Cloud Connect or a Connection: what
they answer comes in behind.

## Moves

A move to a page swaps the screen at once: the page moved to draws what it
has read so far, and the rest arrives in its first frames. An Account
switch keeps the old Account on screen until the new one's Connections have
read their kept list (`Prepared`); then the mark shows while the new
Layout reads what it first draws, and the new Account's home follows.
The page code, and the views that say a page is ready, are preloaded once
the browser is idle, so a move never waits on React's Suspense.

## Voice

Voice is a Child of Connections, so a recording keeps going across pages.

- You start or stop it from anywhere: Space, Ctrl+Space, the mic in the
  header, or a Draft's mic. Layout binds the keys and draws the mic.
- A Draft on screen registers as where text goes, and unregisters when it
  leaves. The last one drawn wins.
- On stop, the text goes into the Draft on screen at that moment. With no
  Draft on screen, it is kept in the dictation list, in the corner, to
  paste into a Draft later or throw away.
- The Draft holds no recording logic. It only says "paste here", takes the
  text that comes, and shows the mic.

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
opened. Connections holds it as `mismatched`, per Connection, beside its
Link, and what Cloud Connect wants it to run says who is behind
(`release.ts`):

- **Updating**: Cloud Connect wants this Code's Release, or names none. The
  socket keeps retrying, with its own backoff, and Cloud Connect is
  rechecked as for any Link down; the header's pill says "Updating
  Connect…". The first socket answered ends it.
- **Stale**: Cloud Connect wants another. This Code moves to its newest
  build (`OnOutdated`), once, as it turns Stale; the pill says "Updating
  Code…".

## Session Sync

The sidebar holds one `MessageIds` Query per Session it shows. Its `where`
on the Session opens that Session's Window, so its messages sync over the
Connection's one socket, and resume after a reconnect. The Query selects only
ids, so its Model and the Kabuki History stay small. Opening the Session
then draws its messages from this device at once.

## Storage

Each level names its own database segment. The names stay as they were.

| Database                                                         | Table                      | Kind  | Written by                |
| ---------------------------------------------------------------- | -------------------------- | ----- | ------------------------- |
| `code:device`                                                    | `accounts`                 | Local | Accounts (auth-toolkit)   |
|                                                                  | `preferences`              | Local | Preferences               |
| `code:account:<accountId>`                                       | `connections`              | Cache | Connections               |
|                                                                  | `sidebar`                  | Local | the sidebar filter        |
| `code:account:<accountId>:connection:<connectionId>`             | `setup`, `skills`          | Cache | connection, project       |
|                                                                  | `seen`                     | Local | session                   |
|                                                                  | `drafts`                   | Local | draft                     |
| `code:account:<accountId>:connection:<connectionId>:sync:<name>` | Projects, Sessions, Turns… | Sync  | the Connection's Replicas |

Local is known only here and is the truth. Cache is a copy of what Cloud
Connect or a Connection last said: shown first, replaced by the next answer.
Sync is a copy the backend keeps live.

Who prunes, and only on a real answer (a check that fails deletes nothing):

| Who         | When                                   | Prefix                          | Keeps                        |
| ----------- | -------------------------------------- | ------------------------------- | ---------------------------- |
| Account     | the Auth Worker answers, or a sign-out | `code:account:`                 | every Account signed in here |
| Connections | Cloud Connect first answers            | `code:account:<id>:connection:` | the Connections it lists     |

A Project removed and a Connection forgotten are your asks, and go at once.

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
- **Question Panel** (`pages/project/session/question/`), a Child of the
  Session, reads its own Session's, reads back from the Connection how they
  were being answered as it opens and gives it each change, so leaving
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
