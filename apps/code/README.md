# code

The local app for running Claude Code and Codex sessions in project folders, on an ai-toolkit server, at code.kishore.computer.

## Big picture

`code` is the first app on [`@kestack/ai-toolkit`](../../toolkits/ai-toolkit/README.md):
a server on each of your Machines that runs Claude Code and Codex in
folders and serves one projected Message form over WebSocket, reached
through the Machine's tunnel. How the server thinks is in its
[v1 spec](../../toolkits/ai-toolkit/docs/v1-spec.md). The app adds a folder
as a project, starts sessions in it with either agent, and follows each one
live: what you asked, the agent's words, its tool calls and subagents, and
how each turn ended. You sign in (auth-toolkit's `Accounts`, or a Local
Account by email under `dev:local`), and the Machines Backend lists the
Machines signed in as you; the app is on one at a time.

It is a Kabuki Start app, every page drawn in the browser
([`packages/kabuki/docs/routing.md`](../../packages/kabuki/docs/routing.md)).
`/` opens a Machine; every other place is on one, under `/m/:machineId`:
its home picks a project, `/p/:projectId` is a new session in the project,
its composer waiting for the first message, `/p/:projectId/s/:sessionId` is
a session, and `/settings` lists your Machines, to Forget one, and sets the
program each agent runs as on this Machine (its Harness Binary). An agent
whose program does not run is greyed out where sessions start.
All state lives in the pages' actors; the Views only draw and send. The
server's records arrive only through the `Ai` Replica
([`@kestack/std-toolkit/replica`](../../toolkits/std-toolkit/src/replica/README.md)),
read by Queries and kept in IndexedDB, so a reload shows what this device
last saw at once: projects and sessions whole, and a session's messages
once its page has been open. With nothing stored, a page draws a skeleton
until its Query is Caught Up; only then is an empty list or a missing row
believed. Every write is a Command an actor asks for through `AiClient`.

The app is one chain. The root page (`src/shell/actor.ts`) first reads
Device State, what this browser keeps for itself in IndexedDB
(`shell/device-state/`): the user's Bindings, Vim Mode, the Unseen marks of
each Machine and the Machine each Account was last on; nothing is drawn
until it has. Then who is signed in (`shell/sign-in/`), with the Account
Switcher in every header; signed out, only signing in is drawn, and an
Account signed out of this device takes its Machines' records with it.
Then the Machine List of the Account (`shell/machines/`): the list saved
here shows first, then the Backend's, asked again every 15 seconds while
the page is visible; it is shared with every page as `Machines`, and at `/`
it opens the Machine last used here, else the one seen last, or says how
to start one. Last the Machine page (`shell/machine/`), which Provides
everything under it its own socket, its own Replicas and `CurrentMachine`,
which names its `Ai` Instance: switching Machine is a new page, so the old
socket, Replicas and Instance close together and no Machine's socket ever
feeds another's records. It holds the Replica with every project and
session for the sidebar, the socket's state, and the Pickers. While the
Machine is out of reach the header says why, from its record: on its way,
its tunnel broken (seen lately, its tunnel check failing), or down (not
seen for three Heartbeats), with when it was last seen; what it synced
stays readable and nothing can be sent. Device State is the truth: an
actor that shows it reads it again after every write, from this tab or
another.

`src/` is a feature map, checked by Laymos (`laymos.config.json`). Each
page is a folder nested under the page it sits in: `shell/` is the root
page, with `machine/` under it, `home/`, `settings/` and `project/` under
that, and `session/` under `project/`. Each other feature sits in the
folder of the page that draws it: in `shell/`, `sign-in/` and the Machine
List (`machines/`, whose `/` page is the root's own); in `machine/`, the
socket's state (`connection/`), `header/`, `sidebar/`, `background-jobs/`,
the Machine Switcher (`machine-switcher/`), the Project Picker
(`project-picker/`, with the folder Steps it walks in `folder-picker/`),
the Session Switcher (`session-switcher/`) and Session Actions
(`session-actions/`); in `settings/`, `machines/` and `shortcuts/`; in
`project/` the composer, the model Picker and the catalog, the agents,
models and Skills the project page reads once and shares with its pages.
Each makes its own server calls, in an `api.ts` beside its actor;
`refusal/` is the one way they end when refused. `replica/` holds the
Queries, `places/` the address of every place, which every View links
through (only `shell/` imports the router), and `ui/` the small parts any
feature draws, the Picker and the confirmation among them. Every folder is a deep module, a
narrow `index.ts` over its main file, but for one exception: a folder that
holds an actor, a page above all, has `actor.ts` (its define and build) and
`view.tsx` in place of a main file, and its `index.ts` exports them under
short names (`Live`, `View`, `Page`) for the importer to read as
`Home.Live`, `Home.View`. A feature that makes a Picker with `Picker.make`
keeps it in its main file and exports it as one object, as
`ModelPicker.Live`, `ModelPicker.View`; one that owns its Picker, as the
three of `shell/` do, is a folder that holds an actor, with the Picker in
its `actor.ts`. `folder-picker/` holds no actor: its Steps are part of
the Project Picker's one stack, so Ctrl+H from the home folder goes back
to the recent projects, and it exports them with how they load and how a
folder becomes a Project.

The Machine Switcher, where the logo was at the top of the sidebar, names
the Machine the app is on, with a dot while it is out of reach; clicking it
lists your Machines, those online by name and then the rest the most
recently seen first, and asks the Backend again. Settings lists them with
when each was last seen and how its tunnel stands; Forget asks first, then
the Backend forgets it and this device deletes its records. Outside Local
mode, a link goes to the Auth Worker's Home Page to revoke a Machine's
Sign-in outright.

Ctrl+P opens the Project Picker: recent projects, the most recently
active first, then "Open folder…". Choosing a project opens it, a new
session with the composer focused; text that names no project, then
Enter, walks the folders under home searching it. Each folder gone into
is a Step: Enter or Ctrl+L goes in, Ctrl+H or Backspace back out, a path
typed (`~/code/fo`) goes to `~/code` and searches `fo`, hidden folders
show only for a search starting with `.`, and a listing cut short at 100
asks the server again as the search narrows. Mod+Enter chooses the folder
open; a search that names no folder offers to create it there with a git
repository. Either becomes a Project, or opens the one it already is,
while the Picker waits and says why if the server refuses; a folder whose
`git init` failed opens with a warning over the page. Ctrl+J opens the
Session Switcher, every unsettled session across projects, the most
recently active first, then the Settled ones, quieter, each with its
project and how it stands. Ctrl+K opens Session Actions for the session
open, also by the header's button: Settle or Un-settle, Fork from the
latest turn, Go to the original for a fork, Regenerate the title, and
Stop the turn while one runs, each with its keys as bound.

The sidebar (`src/shell/sidebar/`) lists every project, the most
recently active first (a turn started or a session made, never viewing,
so the order holds while you browse), each a small muted heading over
its unsettled sessions, flat and dense. The project open shows all its
sessions, any other its three most recent and "+N", which shows the rest
in place. A session row is its title, bold while Unseen (its last turn
ended since it was last open on this device; opening it, or a turn
ending while it is open, marks it seen), a fork glyph for a fork, and a
6px dot only when it needs attention: breathing while it runs, red when
its last turn failed, amber when the server's stopping cut it off.
"Settled · N" at its foot opens the Settled List (`settled-list/`) in
place of the projects, the most recently Settled first, each row opening
its session or Un-settling it.

A message is written in the composer (`src/shell/project/composer/`), a
CodeMirror editor pinned at the bottom of both pages. A `/` at the start of
a word, or the Skills button over the text, opens the skills Picker; the
one picked goes in as a `/name` chip the cursor steps over and Backspace
removes whole. Files come by paste, drop, or the paperclip. Under the text,
the model Picker goes from the agent to its model and then each of its
settings; once a session has started it keeps its agent and opens at the
model, and only its model and settings change, from the next message on. A
Picker (`src/ui/picker/`) is a stack of Steps drawn by cmdk: opened by keys
it is a centred list, by pointer a popover by its button, and a trail shows
the choices so far ([CONTEXT.md](./CONTEXT.md)). In a session,
`/btw <question>` asks the session on the side and shows the answer in a
popover; nothing is kept. Each finished turn can be forked from, which
opens a new session that remembers the conversation up to that turn. A
fork copies nothing: its page reads the sessions up its chain, one
Window each, and draws what came before its own turns as one line,
"Earlier in ‹title› · N turns", that opens to them (`earlier.ts`). Background Jobs the agents left
running show in a bubble at the top right, grouped by session, each with a
Stop button.

The transcript pairs Messages as it draws them (`thread.ts`): a tool call
runs until its result arrives, and is stopped if its turn ended first; a
subagent's call holds the Messages whose `agentId` is its id, nested,
under its prompt; a turn's usage is its `turnEnded` usage, or the sum of its usage parts;
streamed text and reasoning arrive a few sentences at a time as `textChunk`s,
joined by `streamId` into one block where the first chunk is. Each tool call
reads as a verb and its target, with paths relative to the project's folder
and an edit drawn as its diff (`tools.ts`); a run of calls of one kind folds
into one line.

The keyboard comes from `@kestack/use-keys`, defined in one file
(`src/keys.ts`): the sidebar and the page are the two Surfaces you work
in, the composer is part of the page, and every Picker and the help sheet
are isolated Surfaces over them, open while Active. Each Surface puts focus
back where it last was when you come back to it, and the composer's editor
is the page's default spot, so closing a Picker or moving to another
session leaves you writing; no popup moves focus as it closes. In a
Picker, Enter picks, Ctrl+L goes into the row's next Step, Mod+Enter
finishes on the row highlighted, Ctrl+H or Backspace in an empty search
goes back a Step, Escape clears the search and then closes, and the
arrows or Ctrl+N and Ctrl+P move; each is an Action of the `picker`
Surface, taken before cmdk hears it. A Picker opened over another takes
the Surface from it. Settings lists every Action of `keys.ts` by Surface, with a search: clicking a row's keys
records the next key pressed in their place, on an isolated Surface where
no app key works, and Escape keeps them. A key another Action on the same
Surface has names it and offers to Swap; one a nearer Surface has is
allowed, with a note; a key that would type, for an Action that works
while typing, is refused. The keys are kept in Device State, handed to the
Keys Provider, listed by `?`, and named in every title and hint, as
bound. `Mod+Alt+V` or
Settings turns Vim Mode on, kept in Device State; the app then floats as a
window whose status line says where you are, `?` lists every key, `Space e`
goes to the sidebar, `j`/`k`
move through the sidebar and the page, Enter opens the sidebar's row, Escape in the sidebar
goes back to the page, and `i` writes.
Always, even while typing: `Ctrl+P`, `Ctrl+J` and `Ctrl+K` open the
Project Picker, the Session Switcher and Session Actions, `Ctrl+N` starts
a new session in the project open, `Ctrl+B` shows or hides the sidebar,
`Ctrl+H` and `Ctrl+L` go to the sidebar and the page, `Ctrl+,` goes to Settings and, again or by Escape, back where you were,
`Ctrl+[`/`Ctrl+]` open the previous and next unsettled session in the
sidebar's order, showing one hidden behind "+N" and scrolling it into
view without taking focus, `Ctrl+M` opens the
model Picker, `Mod+.` stops a turn, and Page Up and Page Down scroll the
transcript. The composer's editor hands these to the page before its own
macOS Ctrl keys. Whether the sidebar is shown is not kept: the App Shell
holds it, shut at first on a phone and open on a wide screen.

## Usage

### Run a Machine and the app

Start the app (below), sign in, then make this computer a Machine: it
signs in as you, reports itself to the Backend every 15 seconds, and
shows up in the app.

```sh
pnpm --filter code dev:local
npx @kestack/ai-toolkit serve --as you@example.com --backend https://api-code.kishore.computer
```

- Under `dev:local` sign in by typing the same email `--as` names: the same
  email is the same User. Signing in through the Auth Worker, `serve`
  alone signs in from its Device Screen.
- With no Machine, the app says what to run; it opens the Machine last
  used on this device, else the one seen last.
- `pnpm --filter code lint` checks types and the Laymos Rules; `pnpm --filter
code test` runs the tests. Videos recorded under `qa/` stay local.

### Run with the Machines Backend, and deploy

`pnpm dev` runs `alchemy dev` (`alchemy.run.ts`, `src/infra/`) through
Portless: the site at `https://code.kishore.computer` and the Machines
Worker, the Backend from `@kestack/ai-toolkit/machines/backend` over a D1
database of its own, on port 4591, aliased as
`https://api-code.kishore.computer`.

```sh
pnpm --filter code dev:local     # AUTH=local: sign in by name, no Auth Worker
pnpm --filter code dev           # signs in with https://auth.kishore.computer, which must be running
pnpm --filter code deploy        # your own stage, at its workers.dev URLs
pnpm --filter code deploy:prod   # ALLOW_DEPLOY=true: code.kishore.app and api-code.kishore.app
```

- The site gets `VITE_MACHINES_URL` and either `VITE_AUTH_URL` or
  `VITE_AUTH_LOCAL=true`; the Worker gets `AUTH_URL` or `AUTH_LOCAL=true`,
  `SITE_ORIGIN` (the one origin it lets call with credentials) and `DB`.
- `AUTH=local` works only under `alchemy dev`; any deploy with it throws.
- A deployed stage (`prod`, `demo`, `pr<N>`) needs `ALLOW_DEPLOY=true` and
  keeps its state in Cloudflare; a personal stage keeps it in `.alchemy/`.
