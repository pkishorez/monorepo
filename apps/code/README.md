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
Machines signed in as you; the app is on all of them at once
([ADR 0018](../../toolkits/ai-toolkit/docs/adr/0018-an-app-is-on-every-machine-at-once.md)).

It is a Kabuki Start app, every page drawn in the browser
([`packages/kabuki/docs/routing.md`](../../packages/kabuki/docs/routing.md)).
`/` picks a project of any Machine, and `/settings` lists your Machines,
to Forget one, each with its own settings: the program each agent runs
as there (its Harness Binary) and its Speech to Text switch
([ADR 0017](../../toolkits/ai-toolkit/docs/adr/0017-speech-to-text-runs-on-the-machine.md)). Only what is on one Machine names it, under
`/m/:machineId`: `/p/:projectId` is a new session in the project, its
Draft waiting for the first message, and `/p/:projectId/s/:sessionId` is
a session. An agent whose program does not run is greyed out where
sessions start.
All state lives in the pages' actors; the Views only draw and send. The
Machines' records arrive only through the `Ai` Replica
([`@kestack/std-toolkit/replica`](../../toolkits/std-toolkit/src/replica/README.md)),
one Instance per Machine, each syncing over its own Machine's socket, read
by Queries across every Machine, each row with its Machine, and kept in
IndexedDB, so a reload shows what this device last saw at once, even of a
Machine that does not answer: projects and sessions whole, and a
session's messages once its page has been open. A page draws a quiet
skeleton only for what this device has never synced (a Query's
`neverSynced`); a missing row is believed only once its Query is Caught
Up. Every write is a Command an actor asks for of one Machine, through
`AiClients`.

The app is one chain. The root page (`src/shell/actor.ts`) first reads
Device State, what this browser keeps for itself in IndexedDB
(`shell/device-state/`): the user's Bindings, the Microphone chosen and the
Unseen marks of each Machine; nothing is drawn until it has. Then who is signed in (`shell/sign-in/`), with the Account
Switcher in every header; signed out, only signing in is drawn, and an
Account signed out of this device takes its Machines' records with it.
Then the Machine List of the Account (`shell/machines/`): the list saved
here shows first, then the Backend's, asked again every 15 seconds while
the page is visible; it is shared with every page as `Machines`, and with
no Machine, home says how to start one. Then the root holds every listed
Machine at once: its Replicas, whose `Ai` Instances open only for a
Machine in the list, each Machine's socket, dialled at its listed address
(`AiClients`, over `MachineAddress`), and Queries of every Machine's
projects and sessions, so a Machine added opens its Instance and one
forgotten lets go of it, then its database is deleted. It holds each
socket's state (`shell/connection/`), every Machine's Background Jobs,
the Pickers, and the Dictation (`shell/dictation/`), which records from
the microphone (`shell/recorder/`) and carries on wherever the app goes. The Machine page (`shell/machine/`) is only the address
of what is on one Machine: it Provides that Machine's `AiClient` to its
project and session pages. A Machine that does not answer keeps what it
synced, readable, its projects marked by its Last Seen in the sidebar;
on its pages the header says why, from its Machine Status: downloading
cloudflared, opening its tunnel, the tunnel failed to open, its tunnel
broken (its last check failing), or down (not seen for three Heartbeats),
and nothing can be sent. Device State is the truth: an
actor that shows it reads it again after every write, from this tab or
another.

`src/` is a feature map, checked by Laymos (`laymos.config.json`). Each
page is a folder nested under the page it sits in: `shell/` is the root
page, with `home/`, `settings/` and `machine/` under it, `project/` under
`machine/`, and `session/` under `project/`. Each other feature sits in the
folder of the page that draws it: in `shell/`, `sign-in/`, the Machine
List (`machines/`), each Machine's socket state (`connection/`),
`header/`, `sidebar/`, `background-jobs/`, the Dictation (`dictation/`)
and the microphone it records (`recorder/`), the Microphone Picker
(`microphone-picker/`), the Project Picker
(`project-picker/`, with the folder Steps it walks in `folder-picker/`),
the Session Switcher (`session-switcher/`) and Session Actions
(`session-actions/`); in `settings/`, `machines/` (with each Machine's
`harness-binaries/` and `speech-to-text/`) and `shortcuts/`; in `project/` the Draft, the model
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
four of `shell/` do, is a folder that holds an actor, with the Picker in
its `actor.ts`. `folder-picker/` holds no actor: its Steps are part of
the Project Picker's one stack, so Ctrl+H from the home folder goes back
to the recent projects, and it exports them with how they load and how a
folder becomes a Project.

Settings lists your Machines from the Backend alone, at once, each in its
own section with when it was last seen and how its tunnel stands, then
its own settings, read from the Machine itself on their own: one that does
not answer says so in its section. Its Speech to Text switch follows the
Machine live: off; downloading, with how much of the model is in; ready;
or failed, saying why, with a retry. On, the Machine downloads the model
and keeps the wish; off deletes the model. Forget asks first, then the Backend
forgets it, it leaves the list, and this device deletes its records.
Outside Local mode, a link goes to the Auth Worker's Home Page to revoke
a Machine's Sign-in outright.

`o` opens the Project Picker: first the Machine, a Step skipped while
there is only one, then its recent projects, the most recently active
first, then "Open folder…". Choosing a project opens it, a new
session with its Draft; text that names no project, then
Enter, walks the folders under the Machine's home searching it. Each folder gone into
is a Step: Enter or Ctrl+L goes in, Ctrl+H or Backspace back out, a path
typed (`~/code/fo`) goes to `~/code` and searches `fo`, hidden folders
show only for a search starting with `.`, and a listing cut short at 100
asks the server again as the search narrows. Mod+Enter chooses the folder
open; a search that names no folder offers to create it there with a git
repository. Either becomes a Project, or opens the one it already is,
while the Picker waits and says why if the server refuses; a folder whose
`git init` failed opens with a warning over the page. `s` opens the
Session Switcher, every unsettled session across projects and Machines,
the most recently active first, then the Settled ones, quieter, each with
its project, its Machine while there is more than one, and how it
stands. `a` opens Session Actions for the session
open, also by the header's button: Settle or Un-settle, Fork from the
latest turn, Go to the original for a fork, Regenerate the title, and
Stop the turn while one runs, each with its keys as bound.

The sidebar (`src/shell/sidebar/`) lists every project of every Machine
as one list, the most recently active first (a turn started or a session
made, never viewing, so the order holds while you browse), each a small
muted heading over its unsettled sessions, flat and dense; after a
project's name, its Machine's name in small text, while there is more than
one Machine, and, while that Machine does not answer, when it was last
seen. The project open shows all its
sessions, any other its three most recent and "+N", which shows the rest
in place. A session row is its title, bold while Unseen (its last turn
ended since it was last open on this device, kept per Machine; opening
it, or a turn ending while it is open, marks it seen), a fork glyph for a fork, and a
6px dot only when it needs attention: breathing while it runs, red when
its last turn failed, amber when the server's stopping cut it off.
"Settled · N" at its foot opens the Settled List (`settled-list/`) in
place of the projects, the most recently Settled first, each row opening
its session or Un-settling it.

A message is written in the Draft (`src/shell/machine/project/draft/`), a
CodeMirror editor in one card with the Status Line, pinned to the foot of
the page while the transcript scrolls above it; the same card is on the
new-session page. It is read only: it can be scrolled, clicked to place the cursor and
dragged to select. `i`, or a tap, makes it the Composer in place, and
Escape makes it read only again, keeping its text, cursor and selection;
Enter sends it from the page, and in the Composer Enter or Mod+Enter
sends and Shift+Enter is a new line. A paste or a drop anywhere on the
page, and a Skill picked, go in at its cursor, over the selection: each is
an Insert the page hands back, numbered, for the editor to put in once.
The cursor sits after it, the page scrolls it into view, and it fades
from a highlight in about a second, not at all with reduced motion; `u`,
or Mod+Z in the Composer, takes the last one back out. Files are attached instead, drawn under its
text. `/` from the page, a `/` typed at the start of a word in the
Composer, or the Skills button opens the skills Picker; the one picked
goes in as a `/name` chip the cursor steps over and Backspace removes
whole. The Status Line at the page's foot holds the model Picker, the
Skills button, the paperclip, the mic and the send button. The model
Picker goes from the agent to its model and then each of its settings;
once a session has started it keeps its agent and opens at the model, and only its model
and settings change, from the next message on; `p` and `e` open it at the
permissions or the effort alone.

A Dictation is the other way in. Space from the page or the sidebar,
Ctrl+Space anywhere, a Picker and the Composer included, or the Status
Line's mic button start it and stop it. The browser records raw PCM
through an AudioWorklet, one channel at 16 kHz, 16-bit, and keeps the
whole clip in memory until the next one; at five minutes it stops itself.
While it records, the line over every Draft on screen shows it in place
of "Draft": a slowly breathing red dot, the time, a small level meter, the
Microphone's name and the keys to stop it or change Microphone, and the
card's border takes a red tint. With no Draft on screen, at home or in
Settings, a badge in the bottom right corner shows the same. Only the
meter and the clock read the level and the time, so nothing else on the
page draws again as they move. When one cannot start, because the
microphone is blocked or missing or no Machine has Speech to Text on, or
the Microphone chosen is not connected and the default records instead,
the badge says so for a few seconds. `d`, or the chevron beside the Status
Line's mic, opens the Microphone Picker: this browser's microphones, the
system default first, the one chosen checked, asking to use the microphone
first so their names show, and following one plugged in or out while it
is open. The one chosen is kept in Device State, and one chosen while a
Dictation records is switched to at once, into the same clip. Its text
goes to the Draft open when it stops: the line over that Draft says
"Transcribing…", and a "transcribing…" placeholder sits at its cursor, not
part of the text, until the text goes in there as any insert does, so `u`
takes it out again; stopped with no Draft open, it goes to the next one
drawn. The clip is sent whole in one `transcribe` to the open
session's Machine when its Speech to Text is ready and it answers, else to
any listed Machine that is; refused, the placeholder reads "couldn't
transcribe — retry", which sends the same clip again. Escape never touches
a Dictation.

A Picker (`src/ui/picker/`) is a stack of Steps drawn by cmdk: opened by keys
it is a centred list, by pointer a popover by its button, and a trail shows
the choices so far ([CONTEXT.md](./CONTEXT.md)). In a session,
`/btw <question>` asks the session on the side and shows the answer in a
popover; nothing is kept. Each finished turn can be forked from, which
opens a new session that remembers the conversation up to that turn. A
fork copies nothing: its page reads the sessions up its chain, one
Window each, and draws what came before its own turns as one line,
"Earlier in ‹title› · N turns", that opens to them (`earlier.ts`). Background Jobs the agents left
running on any Machine show in a bubble at the top right, grouped by
session, each with a Stop button.

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
(`src/keys.ts`), and is always on: the sidebar and the page are the two
Surfaces you work in, the Draft is part of the page, and every Picker and
the help sheet are isolated Surfaces over them, open while Active. Each
Surface puts focus back where it last was when you come back to it, the
page's own column at first; no popup moves focus as it closes. Plain keys work from the page's or the sidebar's Normal Mode:
`h` and `l` go to the sidebar and the page, `j` and `k` move through the
sidebar's rows and scroll the page, `g g` and `Shift+G` go to the top and
the bottom, Enter opens the sidebar's row or sends the Draft, `i` edits
the Draft, `u` undoes the last thing put in it, `/` puts a Skill in it,
`m`, `p` and `e` open the model Picker at the model, the permissions and
the effort, Space starts or stops a Dictation, `d` opens the Microphone
Picker, `o`, `s` and `a` open the
Project Picker, the Session Switcher and Session Actions, `n` starts a new session in the project
open, `b` shows or hides the sidebar, `[` and `]` open the previous and
next unsettled session in the sidebar's order, showing one hidden behind
"+N" and scrolling it into view without taking focus, `?` lists every
key, and Escape in the sidebar goes back to the page. Even while typing,
`Ctrl+,` goes to Settings and, again or by Escape, back where you were,
`Mod+.` stops a turn, Ctrl+Space starts or stops a Dictation, in a
Picker too, and Page Up and Page Down scroll the transcript; the
Composer's editor hands these to the page before its own macOS Ctrl keys.
In a Picker, Enter picks, Ctrl+L goes into the row's next Step, Mod+Enter
finishes on the row highlighted, Ctrl+H or Backspace in an empty search
goes back a Step, Escape clears the search and then closes, and the
arrows or Ctrl+N and Ctrl+P move; each is an Action of the `picker`
Surface, taken before cmdk hears it. A Picker opened over another takes
the Surface from it. Settings lists every Action of `keys.ts` by Surface,
with a search: clicking a row's keys records the next key pressed in
their place, on an isolated Surface where no app key works, and Escape
keeps them. A key another Action on the same Surface has names it and
offers to Swap; one a nearer Surface has is allowed, with a note; a key
that would type, for an Action that works while typing, is refused. The
keys are kept in Device State, handed to the Keys Provider, listed by
`?`, and named in every title and hint, as bound. Whether the sidebar is shown is not kept: the App Shell
holds it, shut at first on a phone and open on a wide screen.

## Usage

### Run a Machine and the app

Start the app (below), sign in, then make this computer a Machine: it
signs in as you, reports itself to the Backend every 15 seconds, and
shows up in the app.

```sh
pnpm --filter code dev                  # signs in with https://auth.kishore.computer
pnpm --filter @kestack/ai-toolkit dev   # opens the Device Screen once, then is a Machine

pnpm --filter code dev:local            # or: sign in by name, no Auth Worker
pnpm --filter @kestack/ai-toolkit dev:local
```

- ai-toolkit's `dev` asks portless where this app's Backend is
  (`api-code.kishore`, the name `dev` gives it), so the two always meet.
- Under `dev:local` the Machine signs in as `dev@kishore.computer`: sign in
  to the app by typing that email, since the same email is the same User.
  Signing in through the Auth Worker, the Machine signs in from its Device
  Screen the first time and keeps the Sign-in.
- With no Machine, home says what to run; each Machine that signs in
  shows up beside the others.
- `pnpm --filter code lint` checks types and the Laymos Rules; `pnpm --filter
code test` runs the tests. Videos recorded under `qa/` stay local.

### Run with the Machines Backend, and deploy

`pnpm dev` runs `alchemy dev` (`alchemy.run.ts`, `src/infra/`) through
Portless: the site at `https://code.kishore.computer` and the Machines
Worker, the Backend from `@kestack/ai-toolkit/machines/backend` over a D1
database of its own, on port 4591, aliased as
`https://api-code.kishore.computer`. In a linked git worktree both have
the branch in front, `https://<branch>.api-code.kishore.computer`, so each
worktree has its own Backend; only one can run at a time, since the port
is fixed.

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
