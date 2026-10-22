# code

The local app for running Claude Code and Codex sessions in project folders, on an ai-toolkit server, at code.kishore.computer.

## Big picture

`code` is the first app on [`@kestack/ai-toolkit`](../../toolkits/ai-toolkit/README.md):
a server on this machine that runs Claude Code and Codex in folders and
serves one projected Message form over WebSocket. How the server thinks is in
its [v1 spec](../../toolkits/ai-toolkit/docs/v1-spec.md). The app adds a
folder as a project, starts sessions in it with either agent, and follows
each one live: what you asked, the agent's words, its tool calls and
subagents, and how each turn ended. It is local only, with no sign-in.

It is a Kabuki Start app, every page drawn in the browser
([`packages/kabuki/docs/routing.md`](../../packages/kabuki/docs/routing.md)).
Four places: `/` picks a project, `/p/:projectId` is a new session in
the project, its composer waiting for the first message,
`/p/:projectId/s/:sessionId` is a session,
and `/settings` sets the program each agent runs as (its Harness Binary). An
agent whose program does not run is greyed out where sessions start.
All state lives in the pages' actors; the Views only draw and send. The
server's records arrive only through the `Ai` Replica
([`@kestack/std-toolkit/replica`](../../toolkits/std-toolkit/src/replica/README.md)),
read by Queries and kept in IndexedDB, so a reload shows what this device
last saw at once: projects and sessions whole, and a session's messages
once its page has been open. With nothing stored, a page draws a skeleton
until its Query is Caught Up; only then is an empty list or a missing row
believed. Every write is a Command an actor asks for through `AiClient`.

The app is one chain, in the root page's actor (`src/shell/actor.ts`).
First it reads Device State, what this browser keeps for itself in
IndexedDB (`shell/device-state/`): the user's Bindings, Vim Mode and
Unseen marks; nothing is drawn until it has. Then it holds the connection
to the server, so while the server is out of reach the header says so and
nothing can be sent, the Replica with every project and session for the
sidebar, and the three Pickers the app's keys open from anywhere. Last come the pages, which Kabuki keeps whatever the root's
State: what they read from the Replica waits for it, and they are drawn
only once Device State is read. Device State is the truth: an actor that
shows it reads it again after every write, from this tab or another.

`src/` is a feature map, checked by Laymos (`laymos.config.json`). Each
page is a folder nested under the page it sits in: `shell/` is the root
page, with `home/`, `settings/` and `project/` under it, and `session/`
under `project/`. Each other feature sits in the folder of the page that
draws it: in `shell/`, `header/`, `sidebar/`, `background-jobs/`, and the
Project Picker (`project-picker/`, with the folder Steps it walks in
`folder-picker/`), the Session Switcher (`session-switcher/`) and Session
Actions (`session-actions/`); in `project/` the composer, the model
Picker and the catalog, the agents, models and Skills the project page
reads once and shares with its pages.
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

### Run the server and the app

Build ai-toolkit and start its server on port 4590, then start the app.

```sh
pnpm --filter @kestack/ai-toolkit build
node toolkits/ai-toolkit/bin/ai-toolkit.mjs serve --port 4590 --db /tmp/ai-dev/ai.db
pnpm --filter code dev
```

- `dev` builds the workspace packages the app uses, then serves it through
  portless as `code.kishore`; open the URL it prints.
- The app reaches the server at `VITE_AI_URL`, `http://127.0.0.1:4590/rpc`
  unless set; `http` becomes `ws` on its own.
- Without `--db` the server keeps its database at `~/.ai-toolkit/ai.db`.
- `pnpm --filter code lint` checks types and the Laymos Rules; `pnpm --filter
code test` runs the tests. Videos recorded under `qa/` stay local.
