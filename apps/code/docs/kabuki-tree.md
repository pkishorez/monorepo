# code actor tree

`code` runs Claude Code and Codex Sessions in Projects, on every Machine of
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
   until the new Account's Machines are ready. It prunes `code:account:`
   once the Auth Worker really answers, keeping the Accounts signed in.
3. **Machines** (`device/account/machines/`) reads the Account's Machine
   list and sidebar filter from `code:account:<id>`. It asks Cloud Connect
   for the list and prunes `code:account:<id>:machine:` on the first real
   answer. It has three parts:
   1. **machine/**: one per Machine. Its connection (how it is reached,
      its health, why it refused), its records (Projects, Sessions,
      messages, and Moves on their way), and its store (setup, Skills,
      Unseen marks, Saved Drafts, sync).
   2. **voice/**: recording from anywhere. The Dictation, the recorder and
      the Microphone Picker. One per Account, so it keeps recording while
      you move between pages.
   3. **layout/**: what you see. Its view draws the header. It has three
      parts:
      1. **sidebar/**: the Projects and Sessions of the Machines shown.
         `session-sync/` keeps the messages of every Session shown in
         sync, before you open it.
      2. **pickers/**: what the keys open. `projects/` (Project Picker and
         folder Picker), `sessions/` (Session Switcher), `actions/` (what
         you can do here, each with its keys).
      3. **pages/**: one page from the URL: `home/`, `project/`,
         `settings/`.
         - `project/` (`/m/:machine/p/:project`) owns the Catalog (agents,
           models, Skills) and gives it down. Its parts: `draft/`,
           `new-session/` (a Draft that starts a Session) and `session/`
           (`…/s/:session`).
         - `draft/` keeps the text, files and choices, and the saved
           Draft. Its parts: `write/` (editor, attachments, touch mode),
           `pick/` (agent and model, Skills) and `send/` (message, side
           question).
         - `session/` holds the Session's row, its fork history, Stop,
           Fork and Seen; `transcript/` draws its turns, tool calls and
           words.
         - `settings/` has `general/`, `shortcuts/` and `machines/` (one
           card per Machine: its accounts, speech and Projects).

`src/ui/` holds plain parts with no data: `page/` (devtools, gutter,
theme), `controls/` (notices, the Picker, settings rows) and `labels/`
(agent, path, status).

## Actors

The actor tree follows the folders, with one difference: Layout and the
pages are Children of the Device, not of Machines. The Machines of two
Accounts run at once while one prepares, and Layout starts over for each
Account drawn, which a Child of one Machines could not do.

```
device                          root page; States: Reading | Checking | SignedIn | SignedOut
├── account                     the Account Switcher (library Actor)
├── machines                    each: the Account drawn, and the one about to be
│   ├── voice                   always
│   │   ├── dictation           always; hears asks only while its Account is drawn
│   │   └── microphonePicker    always
│   └── machine                 each: listed Machine id
│       └── replicas            its Machine's Replica Instances
├── layout                      key: the Account drawn
│   ├── sidebar                 always, on a phone too while it is shut
│   │   └── sessionSync         always
│   │       └── messages        each: shown Session id (a MessageIds Query)
│   ├── pickers                 always: projects, sessions, actions
│   └── project, session        the rows the header names
└── pages                       one at a time, from the URL
    ├── Home
    ├── Settings                general, shortcuts, machines (one card each)
    ├── Project                 the Catalog; draft while no Session is open
    │   └── Session             /s/:sessionId; its draft
    └── Kabuki                  /kabuki
```

Every Picker made by `Picker.make`, every Replica Query and the Account
Switcher come from a library or a factory, and have no folder of their own.

## First draw

The app is drawn whole, in one step, from what this device holds. Until
Layout is shown, the root page's mark stays and Layout draws nothing; the
sidebar and the page each say once, from their View, that all they first
draw is read (`Ready`): the sidebar its width and the rows and marks of
every Machine shown, the page its own (home its projects; a project its row
and the new session's Saved Draft; a session its row, messages and Saved
Draft). With the header's rows and the page's code loaded too, Layout is
shown (`Ready`). Nothing waits on Cloud Connect or a Machine: what
they answer comes in behind.

## Moves

A move to a page swaps the screen at once: the page moved to draws what it
has read so far, and the rest arrives in its first frames. An Account
switch keeps the old Account on screen until the new one's Machines have
read their kept list (`Prepared`); then the mark shows while the new
Layout reads what it first draws, and the new Account's home follows.
The page code, and the views that say a page is ready, are preloaded once
the browser is idle, so a move never waits on React's Suspense.

## Voice

Voice is a Child of Machines, so a recording keeps going across pages.

- You start or stop it from anywhere: Space, Ctrl+Space, the mic in the
  header, or a Draft's mic. Layout binds the keys and draws the mic.
- A Draft on screen registers as where text goes, and unregisters when it
  leaves. The last one drawn wins.
- On stop, the text goes into the Draft on screen at that moment. With no
  Draft on screen, it is kept in the dictation list, in the corner, to
  paste into a Draft later or throw away.
- The Draft holds no recording logic. It only says "paste here", takes the
  text that comes, and shows the mic.

## Session Sync

The sidebar holds one `MessageIds` Query per Session it shows. Its `where`
on the Session opens that Session's Window, so its messages sync over the
Machine's one socket, and resume after a reconnect. The Query selects only
ids, so its Model and the Kabuki History stay small. Opening the Session
then draws its messages from this device at once.

## Storage

Each level names its own database segment. The names stay as they were.

| Database                                                   | Table                      | Kind  | Written by              |
| ---------------------------------------------------------- | -------------------------- | ----- | ----------------------- |
| `code:device`                                              | `accounts`                 | Local | Accounts (auth-toolkit) |
|                                                            | `preferences`              | Local | Preferences             |
| `code:account:<accountId>`                                 | `machines`                 | Cache | Machines                |
|                                                            | `sidebar`                  | Local | the sidebar filter      |
| `code:account:<accountId>:machine:<machineId>`             | `setup`, `skills`          | Cache | machine, project        |
|                                                            | `seen`                     | Local | session                 |
|                                                            | `drafts`                   | Local | draft                   |
| `code:account:<accountId>:machine:<machineId>:sync:<name>` | Projects, Sessions, Turns… | Sync  | the Machine's Replicas  |

Local is known only here and is the truth. Cache is a copy of what Cloud
Connect or a Machine last said: shown first, replaced by the next answer.
Sync is a copy the backend keeps live.

Who prunes, and only on a real answer (a check that fails deletes nothing):

| Who      | When                                   | Prefix                       | Keeps                        |
| -------- | -------------------------------------- | ---------------------------- | ---------------------------- |
| Account  | the Auth Worker answers, or a sign-out | `code:account:`              | every Account signed in here |
| Machines | Cloud Connect first answers            | `code:account:<id>:machine:` | the Machines it lists        |

A Project removed and a Machine forgotten are your asks, and go at once.
