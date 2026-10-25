# code

The app for running Claude Code and Codex sessions in project folders on any of your Machines, through Connect, at code.kishore.app.

## Big picture

`code` is the first app on [`@kestack/connect`](../connect/README.md): it
talks to `@kestack/connect`, whose `code` App Group on each of your
Machines runs Claude Code and Codex in folders (through
[ai-toolkit](../../toolkits/ai-toolkit/README.md)) and serves
one projected Message form over WebSocket, reached through the Machine's
tunnel. How it thinks is in the
[v1 spec](../../toolkits/ai-toolkit/docs/v1-spec.md). The app adds a folder
as a project, starts sessions in it with either agent, and follows each one
live: what you asked, the agent's words, its tool calls and subagents, and
how each turn ended. You sign in (auth-toolkit's `Accounts`), and Cloud
Connect ([`@kestack/connect`](../connect/README.md)) lists the Machines
signed in as you; the app is on all of them at once
([ADR 0018](../../toolkits/ai-toolkit/docs/adr/0018-an-app-is-on-every-machine-at-once.md)).

It is a Kabuki Start app, every page drawn in the browser
([`packages/kabuki/docs/routing.md`](../../packages/kabuki/docs/routing.md)).
`/` picks a project of any Machine, and `/settings` lists your Machines,
to Forget one, each with its own settings: each login of an agent there
(its Harness Accounts: the program it runs and its config folder, such as
a second Claude for work) and its Speech to Text switch
([ADR 0017](../../toolkits/ai-toolkit/docs/adr/0017-speech-to-text-runs-on-the-machine.md)). Only what is on one Machine names it:
`/m/:machineId/p/:projectId` is a new session in the project, its Draft
waiting for the first message, and `/m/:machineId/p/:projectId/s/:sessionId`
is a session. Each Harness Account is an agent to pick where sessions
start; one whose program does not run, such as an agent not installed,
is greyed out with how to install it.
All state lives in the pages' actors; the Views only draw and send. The
Machines' records arrive only through the `CodeReplica` Replica
([`@kestack/std-toolkit/replica`](../../toolkits/std-toolkit/src/replica/README.md)),
one Instance per Machine, each syncing over its own Machine's socket, read
by Queries across every Machine, each row with its Machine, and kept in
IndexedDB, so a reload shows what this device last saw at once, even of a
Machine that does not answer: projects and sessions whole, and a
session's messages once its page has been open. A page draws a quiet
skeleton only for what this device has never synced (a Query's
`neverSynced`); a missing row is believed only once its Query is Caught
Up. Every write is a Command an actor asks for of one Machine, through
`CodeClients`.

The app is one tree of Kabuki Actors, drawn in [docs/kabuki-tree.md](docs/kabuki-tree.md):
each part reads only what it shows, so a change draws only that part. The
root page (`src/shell/`) first reads the user's Bindings from Device
State, what this browser keeps for itself in IndexedDB
(`src/layer/`); nothing is drawn
until it has. Then who is signed in, from auth-toolkit's `Accounts`
(`src/layer/services/accounts.ts`; the shell's `sign-in.tsx` draws the
signed-out screen), with the Account
Switcher in every header; signed out, only signing in is drawn, and an
Account signed out of this device takes its Machines' records with it.
Then the Machine List of the Account (`machines/machine-list/`): the list
saved here shows first, then Cloud Connect's, asked again on Reload and,
while a Machine's Line is not up, every 3 seconds for the first minute and
every 30 after, until every Line is up. It holds a Line to each Machine
and watches its Speech to Text, and shares all of it as `Machines`; with
no Machine, home says how to start one. The root Provides every listed
Machine's Replicas, whose `CodeReplica` Instances open only for a Machine in the
list, and each Machine's socket, dialled at its listed address
(`CodeClients`, over `MachineAddress`), so a Machine added opens its
Instance and one forgotten lets go of it, then its database is deleted.
Under it: the sidebar (`actors/sidebar/`), the header (`actors/header/`),
the Pickers, and the Dictation (`actors/dictation/`), which records from
the microphone (`src/layer/services/recorder/`) and carries on wherever
the app goes. The project page (`pages/project/`) names its Machine: it
Provides that Machine's `CodeClient` to its session page. A Machine that does not answer keeps what it synced,
readable, its projects marked by its Last Seen in the sidebar; on its
pages the header says why, from its Machine Status: downloading
cloudflared, opening its tunnel, the tunnel failed to open, its tunnel
broken (its last check failing), or down (not seen for three Heartbeats),
and nothing can be sent. Device State is the truth: an actor that shows
it reads it again after every write, from this tab or another.

`src/` is laid out as the Actor tree, checked by Laymos
(`laymos.config.json`). `src/app.tsx` starts it: the root page's View and
router, and the Layer. `src/shell/` is the root page, with its router
(`router.ts`) and its signed-out screen (`sign-in.tsx`); under it the
Actors on every page in `actors/`, the four Pickers the app's keys open in
`actors/pickers/`, and the pages in `pages/`, a child page in its parent's
folder (`pages/project/session/`). Each Actor folder has `actor.ts` (its
define and build), `commands.ts` when it has Commands, `view.tsx` when it
has a View, and an `index.ts` that exports one object, as `Home.actor`,
`Home.view`, `Home.page`. `src/layer/` is what the app Layer gives the
tree: `capabilities/`, the keys, with what a Machine's record says of it,
and `services/`, what backs them, who is signed in among them; an Actor
that Provides a key of its own keeps it in its own `capabilities/`, as the
project page does its catalog. Code shared by Actors that is not one is a
plain Module in the lowest folder that holds every user: in `src/shell/`
`machines/`, everything about reaching a Machine (the Machine List, each
Machine's Line, the Replica's Queries, its socket and Replicas, and the one
way a server call ends when refused), and `routes/`, the address of every
page, which every View links through; in `actors/`, `moves/`, the Settles
the sidebar and Session Actions ask for. `src/ui/` holds the small parts
any feature draws, the Picker and the confirmation among them, and
`src/keys.ts` the app's whole keyboard. `src/deploy/` is the
infrastructure: the site's Worker. A feature that makes a
Picker with `Picker.make` keeps it in its main file and exports it as one
object, as `ModelPicker.Live`, `ModelPicker.View`; one that owns its
Picker, as the four of `shell/actors/pickers/` do, is an Actor folder with the
Picker in its `actor.ts`. `folder-picker/` holds no actor: its Steps are
part of the Project Picker's one stack, so Ctrl+H from the home folder
goes back to the recent projects, and it exports them with how they load
and how a folder becomes a Project.

Settings lists your Machines from Cloud Connect alone, at once, each in its
own section with when it was last seen and how its tunnel stands, then
its own settings, read from the Machine itself on their own: one that does
not answer says so in its section. Its Speech to Text switch follows the
Machine live: off; downloading, with how much of the model is in; ready;
or failed, saying why, with a retry. On, the Machine downloads the model
and keeps the wish; off deletes the model. Forget asks first, then Cloud Connect
forgets it, it leaves the list, and this device deletes its records.
A link goes to the Auth Worker's Home Page to revoke
a Machine's Sign-in outright.

`o` opens the Project Picker: first the Machine, a Step skipped while
there is only one, then its recent projects, the most recently active
first, then "Open a folder…". Choosing a project opens it, a new
session with its Draft; text that names no project, then
Enter, walks the folders under the Machine's home searching it. Each folder gone into
is a Step: Enter or Ctrl+L goes in, Ctrl+H or Backspace back out, a path
typed (`~/code/fo`) goes to `~/code` and searches `fo`, hidden folders
show only for a search starting with `.`, and a listing cut short at 100
asks the server again as the search narrows. Mod+Enter chooses the folder
open; a search that names no folder offers to create it there with a git
repository. On touch, folders are tapped through, the one open is chosen by
"Open this folder" under its path, and "New folder" beside it makes one
there, with a git repository, and goes into it. On touch, a project
picked, or a folder made one, opens its new session in a Drawer over the
Picker (`pages/project/starter/`, the same as the project's page shows),
and closing it goes back to choosing; the session started, both close on
its page. Either becomes a Project, or opens the one it already is,
while the Picker waits and says why if the server refuses; a folder whose
`git init` failed opens with a warning over the page. `s` opens the
Session Switcher, every unsettled session across projects and Machines,
the most recently active first, then the Settled ones, quieter, each with
its project, its Machine while there is more than one, and how it
stands. `a` opens Session Actions for the session
open, also by the header's button: Settle or Un-settle, Fork from the
latest turn, Go to the original for a fork, Regenerate the title, and
Stop the turn while one runs, each with its keys as bound.

At its top, which stays put as it scrolls, the sidebar
(`src/shell/actors/sidebar/`) has the app's mark and the Machine Filter as
a title: the Machine shown and how it stands, or "All Machines" and how
many sessions they hold; with more than one, it opens the Machines, a
Drawer of each Machine with its state, sessions, projects, tunnel and
version. Beside it, Reload asks Cloud Connect for the Machines again; only
the Machines shown are synced there. It lists every unsettled session as one timeline, the most recently
active first (a turn started or a session made, never viewing, so the
order holds while you browse), under Today, Yesterday, Previous 7 days and
Earlier. A session row is its title, bold while Unseen (its last turn
ended since it was last open on this device, kept per Machine; opening
it, or a turn ending while it is open, marks it seen), a fork glyph for a
fork, its project's name under it, then its Machine's while there is more
than one and, while that Machine does not answer, when it was last seen,
and at its right a word for how it stands: "Running", "Failed",
"Interrupted" (the server's stopping cut it off), "Stopped", a "New" pill
when it finished since you looked, or else how long ago it was active.
On a touch screen a row swipes left to right to Settle it.
Last of all, a quieter "Settled" with how many opens the Settled List
(`settled-list/`) under it, and closes it again: the most recently Settled
first, each row opening its session or Un-settling it, by its button or a
swipe right to left. Two round
buttons float over its foot: You, a Drawer with who is signed in (which
opens the Accounts in a Drawer on top), the theme and Settings, and New
project, the Project Picker.

A message is written in the Draft (`src/shell/pages/project/draft/`), an
Actor of its own, a Child of the new-session page and of each session, so
typing into it draws nothing else; a
CodeMirror editor in one card with the Status Line, pinned to the foot of
the page while the transcript scrolls above it; the same card is on the
new-session page. Out of Vim Mode it is typed into as any text box is. In
Vim Mode it is read only: it can be scrolled, clicked to place the cursor and
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

A Picker (`src/ui/picker/`) is a stack of Steps drawn by cmdk, as the input
that opened it asks, whatever the device: by keys a centred list, by a mouse
a popover by its button, by a touch a Drawer or a Sheet from the bottom; the
screen dims behind it, and a trail shows the choices so far ([CONTEXT.md](./CONTEXT.md)). In a session,
`/btw <question>` asks the session on the side and shows the answer in a
popover; nothing is kept. Each finished turn can be forked from, which
opens a new session that remembers the conversation up to that turn. A
fork copies nothing: its page reads the sessions up its chain, one
Window each, and draws what came before its own turns as one line,
"Earlier in ‹title› · N turns", that opens to them (`earlier.ts`).

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
(`src/keys.ts`). Out of Vim Mode, as a browser starts, the app is worked
as any other: the Draft is a text box, Enter sends and Shift+Enter is a
new line, and only keys holding Ctrl, Alt or Cmd are shortcuts: Ctrl+P,
Ctrl+J and Ctrl+K open the Project Picker, the Session Switcher and
Session Actions, Ctrl+N starts a new session, Ctrl+B shows or hides the
sidebar, Ctrl+/ shows the keys, and the keys below that work while typing
work here too.
Mod+Alt+V, or the switch in Settings, turns Vim Mode on, kept in Device
State: the app floats as a window with the keys' status line at its foot,
and dialogs and Pickers open at once. In Vim Mode the sidebar and the
page are the two Surfaces you work in, the Draft is part of the page, and every Picker and
the help sheet are isolated Surfaces over them, open while Active. Each
Surface puts focus back where it last was when you come back to it, the
page's own column at first; no popup moves focus as it closes. Plain keys work from the page's or the sidebar's Normal Mode:
`h` and `l` go to the sidebar and the page, `j` and `k` move through the
sidebar's rows and scroll the page, `g g` and `Shift+G` go to the top and
the bottom, Enter opens the sidebar's row or sends the Draft, `i` edits
the Draft, `u` undoes the last thing put in it, `/` puts a Skill in it,
`m`, `p` and `e` open the model Picker at the model, the permissions and
the effort, Space starts or stops a Dictation, `d` opens the Microphone
Picker, `t` switches the theme, `o`, `s` and `a` open the
Project Picker, the Session Switcher and Session Actions, `n` starts a new session in the project
open, `b` shows or hides the sidebar, `[` and `]` open the previous and
next unsettled session in the sidebar's order, round past either end,
scrolling it into view without taking focus, `?` lists every
key, and Escape in the sidebar goes back to the page. Even while typing,
`Ctrl+,` goes to Settings and, again or by Escape, back where you were,
Ctrl+H and Ctrl+L go to the sidebar and the page, Ctrl+[ and Ctrl+]
open the previous and next session in the sidebar, going round past
either end as `[` and `]` do, Ctrl+O and Ctrl+I go
Back and Forward,
`Mod+.` stops a turn, Ctrl+Space starts or stops a Dictation, in a
Picker too, and Page Up and Page Down scroll the transcript; the
Composer's editor hands these to the page before its own macOS Ctrl keys.
In a Picker, Enter picks, Ctrl+L goes into the row's next Step, Mod+Enter
finishes on the row highlighted, Ctrl+H or Backspace in an empty search
goes back a Step, Escape clears the search and then closes, and the
arrows or Ctrl+N and Ctrl+P move; each is an Action of the `picker`
Surface, taken before cmdk hears it. A Picker opened over another takes
the Surface from it. Settings and the keys sheet (`?`, or Ctrl+/) list every Action of
`keys.ts` as its key table does: in sections by what is done (Open, Move
around, The Draft, The session, Inside a Picker, The app), one row per
thing, its keys that work in either Mode beside its Vim Mode ones, quieter
while Vim Mode is off. Settings has a search: clicking an Action's keys records the next key pressed in
their place, on an isolated Surface where no app key works, and Escape
keeps them. A key another Action on the same Surface has names it and
offers to Swap; one a nearer Surface has is allowed, with a note; a key
that would type, for an Action that works while typing, is refused. The
keys are kept in Device State, handed to the Keys Provider, listed by
`?`, and named in every title and hint, as bound. Whether the sidebar is shown is not kept: the App Shell
holds it, open on a wide screen.

On a phone the sidebar is home: the App Shell's `sidebarMode="fullscreen"` makes it
the whole screen, with the Project Picker's plus floating in its bottom
right corner and the theme and the Account at its foot. Opening a session
slides it away, and the header's back arrow, or a swipe from the left
edge, brings it back. On a touch screen a session row swipes left to right
to Settle it, or, in the Settled List, to un-Settle it: it slides out, the
list closes up, and a toast offers Undo for five seconds; pulling the
sidebar down from its top Reloads the Machines. A tap opens a Picker in a
Drawer or a Sheet from the bottom, nothing focused, and there is no focus ring
while you touch. The header keeps only where you are, the Machine's offline mark and one
`⋯` for Session Actions, and a touch screen with no keyboard is shown
no keys: no hints, no Vim status line, no keyboard settings. Vim Mode is off
on a device with no keyboard whatever is kept, however wide its screen, and
nothing takes focus as it opens there, a Picker's search included. The Draft's
one round button is the microphone while there is nothing to send, Send
once there is, and a stop while a Dictation records; a narrow Draft folds
Skills, the paperclip and the microphone behind a "+". With no keyboard it is
the Touch Draft (`pages/project/draft/touch/`), its own actor: one microphone
at the bottom right, and Send over it once there is text, which a tap or a
swipe of the microphone up onto it sends. While a Dictation records, the
microphone takes it, a swipe up takes it and sends once it is text, and a
small cancel on the left throws it away beside its time and level. Left of
it, two lines of the Draft, read only, which a tap shows whole; edit, which
makes the whole card the Composer above the keyboard with Done; and the model
chip, whose Drawer changes effort and permissions in place, Skills, and Quick
actions, a Drawer to ask on the side, paste, attach a file or a photo, or
choose the microphone.

The app is a PWA ([`@kestack/web-platform/pwa`](../../platforms/web-platform/README.md)):
"Code" installs with its Mark as the icon (`public/`), opens on iOS to a
Splash of the Mark and its name, each page works offline as its Render
Mode says (a page never opened there boots from the App Shell), and a new
version waits for "Reload" instead of reloading under you.

## Usage

### Run the app on this branch's Connect

`pnpm dev` makes sure this branch's Connect runs, starting it or reusing
the one another App started, then runs the site against it. It signs in
with auth-toolkit's Fake: sign in as any `@kestack.test` email
(`dev@kestack.test` is the Machine's), and the branch's Machine shows up in
the app; it reports itself to Cloud Connect every 15 seconds. Every backend
is on the site's own origin, so a tunnel to it, such as
`cloudflared tunnel --url http://localhost:<port>`, opens the whole app on
a phone. `pnpm dev:real` signs in through the Auth Worker instead.

```sh
pnpm --filter code dev           # this branch's Connect, then the site, signed in with the Fake
pnpm --filter code dev:real      # the same through the Auth Worker; the Device Screen on a new branch
pnpm --filter code deploy        # your own stage, at its workers.dev URLs
pnpm --filter code deploy:prod   # ALLOW_DEPLOY=true: code.kishore.app
```

- `pnpm dev` calls `withConnect` from `@kestack/connect/dev`
  ([Connect in development](../connect/docs/dev.md)), then runs
  `alchemy dev` (`alchemy.run.ts`, `src/deploy/infra/`) through Portless,
  the site at `https://code.kishore.computer` (the branch in front in a
  linked git worktree), handed the branch's Cloud Connect in
  `CONNECT_URL`. Connect stops once no App on the branch runs.
- The site gets `VITE_AUTH_URL` and `VITE_CONNECT_URL`. A deployed stage
  uses `https://connect.kishore.app`, where your Machines are.
- With no Machine, home says what to run; each Machine that signs in
  shows up beside the others.
- A deployed stage (`prod`, `demo`, `pr<N>`) needs `ALLOW_DEPLOY=true` and
  keeps its state in Cloudflare; a personal stage keeps it in `.alchemy/`.
- `pnpm --filter code lint` checks types and the Laymos Rules; `pnpm --filter
  code test` runs the tests. Videos recorded under `qa/` stay local.
- `pnpm --filter code draw:install` redraws the iOS Splash and the
  manifest's screenshots into `public/`, after a build of the packages.
