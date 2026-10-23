# Keyboard-first code: the plan

The decisions from the design session, and the order they are built in. Words
are defined in [`../CONTEXT.md`](../CONTEXT.md),
[`toolkits/ai-toolkit/CONTEXT.md`](../../../toolkits/ai-toolkit/CONTEXT.md),
[`toolkits/std-toolkit/src/replica/CONTEXT.md`](../../../toolkits/std-toolkit/src/replica/CONTEXT.md)
and [`packages/use-keys/CONTEXT.md`](../../../packages/use-keys/CONTEXT.md).
Delete this file once every task is done.

## Ground rules (every task)

- Read the `CONTEXT.md` files above and use their words in code, comments and
  docs. Match the surrounding code's comment density, naming and idiom.
- Load the `laymos` and `deep-module` skills before moving or creating a
  module. Every folder is a deep module: a narrow `index.ts` over a mandatory
  main file. **Page folders** are the one written exception: `actor.ts` (the
  Kabuki define and build) and `view.tsx`, and `index.ts` exports one
  namespace-like name per page (`Home.Live`, `Home.View`, …) or the
  equivalent the code allows; record the exception in the deep-module notes
  of `apps/code/README.md`.
- No hacks: no timers to guess state, no `requestAnimationFrame` focus, no
  `preventDefault` on mousedown to keep focus, no casts to silence types.
- The database is started fresh: no migrations, no `evolve` steps for old
  rows, no code that tidies old data.
- Every changed package gets a changeset in `.changeset/`, bump `patch`
  (packages are 0.x, breaking changes included), written like the existing
  ones. READMEs follow `docs/readme-conventions.md`.
- Do not commit. Finish with the package's `lint` and `test` scripts green
  (`pnpm --filter <pkg> lint`, `pnpm --filter <pkg> test`); say plainly what
  fails if something outside your task breaks them.

## Decisions

### Keys (Ctrl is the basic modifier; every one below is `always` and works while typing)

| Key             | Does                                                                                                                      |
| --------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Ctrl+P          | Project Picker                                                                                                            |
| Ctrl+J          | Session Switcher, most recently active first                                                                              |
| Ctrl+K          | Session Actions                                                                                                           |
| Ctrl+M          | the model Picker (replaces Mod+Shift+M)                                                                                   |
| Ctrl+N          | a new Session in the open Project                                                                                         |
| Ctrl+B          | show or hide the sidebar                                                                                                  |
| Ctrl+,          | Settings; Escape or Ctrl+, again goes back where you were                                                                 |
| Ctrl+[ / Ctrl+] | previous / next unsettled Session in sidebar order; the sidebar unfolds to it and scrolls it in view without taking focus |
| Ctrl+H / Ctrl+L | sidebar / page; Escape in the sidebar goes back to the page                                                               |

App keys win over macOS's text-editing Ctrl keys in the composer. Plain-letter
keys (`j`, `k`, `g g`, …) stay Vim Mode only. Ctrl+Space is unused. Settings
has no keys of its own.

### Focus (use-keys)

Every Surface remembers where focus last was inside it, by a stable name, not
by element, so it survives a remount; a Surface can name its default spot (the
page names the composer). Coming back to a Surface, by any route (a key, a
Picker closing, a session switch that remounts the page, Escape from the
sidebar, leaving Settings), puts focus back there. Base UI's own focus return
is turned off everywhere; Surfaces own focus.

### Picker (apps/code `ui/picker`, on cmdk)

A Picker is a stack of Steps run by one Kabuki actor, on one isolated
use-keys Surface, each Step drawn by cmdk with the actor owning the highlighted
row and the query. Enter picks the row (finishing or opening the next Step);
Mod+Enter finishes on the current choice; Ctrl+H or Backspace on an empty
query goes back one Step; Escape clears the query, then closes. Ctrl+N/Ctrl+P
move rows. A breadcrumb shows the choices so far. Opened by keys it is a
centred fuzzy list; opened by pointer the same actor is drawn as a popover by
its button. Every Picker in the app is one: skills (one Step), model (agent →
model → settings; opens at model once a Session has started; settings skippable
with Mod+Enter), Project Picker, Session Switcher, Session Actions.

### Project Picker and Folder Picker (Ctrl+P)

Recent Projects, fuzzy, then "Open folder…". Choosing a Project starts a new
Session in it with the composer focused. Text matching no Project, then Enter,
opens the folder Steps with that text filled in. The folder Steps start in the
home folder and never leave it: each folder gone into is a Step; Ctrl+L or
Enter goes in; Ctrl+H goes to the parent; Mod+Enter chooses the folder. Typing
a path (`~/code/fo`) goes to `~/code` and filters by `fo`; hidden folders show
only for a query starting with `.`. A listing holds at most 100 folders; when
it is cut short, the query is sent to the server to list matches instead.
Text matching no folder offers "Create ‹text› here": the server makes the
folder, runs `git init` (a failure warns and keeps the folder), adds it as a
Project, and a new Session starts. A folder that already is a Project opens it.
The old add-a-folder-by-path form is removed. It is one nested feature module
with its own actor, view and the API calls it makes.

### Session Actions (Ctrl+K)

Settle / Un-settle, Fork from the latest Turn, Go to the original (Forks
only), Regenerate the title, Stop the Turn (while running). Each row shows its
own key. It replaces the header's session menu. Forking from an earlier Turn
stays the hover button on that Turn.

### Sidebar

Every Project with its unsettled Sessions, flat (no folding). Projects ordered
by last activity (a Turn started or a Session made, not viewing), so the order
holds while browsing; the open Project shows all its Sessions, the others their
three most recent and "+N". Dense: Projects as small muted headings, 28px
Session rows, 8px side padding, 4px between groups. One 6px status dot where
something needs attention: running is a slow breathing muted dot; failed and
interrupted a small destructive / warning dot with a tooltip; cancelled and
idle show nothing. An Unseen Session's title is bold. A Fork is its own row
with a small fork glyph, "Forked from ‹title›" on hover. At the bottom one
line, "Settled · N", opens the Settled List (flat, most recently Settled
first, with the Project's name; open a row, or Un-settle it).

### Forks

A Fork stores only `forkedFrom`; nothing of the original is copied
(ADR 0014). Its transcript draws the original's Messages up to that Turn's end,
folded into one line "Earlier in ‹title› · N turns" that unfolds on click,
then its own; a Fork of a Fork reads up the chain. The " (fork)" title suffix
goes; the glyph says it. The Session page keeps a link to the original.

### Server (ai-toolkit)

- `AiApi` is split into RpcGroups merged into one: harnesses, projects,
  sessions, turns, jobs, folders. The client stays flat (`api.listFolder`).
  Rewrite ADR 0004 to say so; correct `docs/v1-spec.md` on forks.
- Session gains `settledAt` (null when not Settled) and `activeAt` (when a Turn
  last started, or when it was made). `settleSession` / `unsettleSession`;
  sending a message un-settles. Schema is one version: drop the `evolve` step.
- No-copy Fork: the engine no longer copies Raw into the Fork.
- Folders: `listFolder { path, query? }` → `{ path, parent, folders: { name,
hidden, link }[], truncated }`, home only (a path resolving outside home is
  refused), at most 100 entries, name-sorted, a time limit per listing;
  `createFolder { parent, name }` → `{ path }` with `git init`, refusing bad
  names and never making parents. Typed errors (not found, permission
  denied, exists, invalid name, outside home, unreadable). `addProject`
  resolves symlinks so one folder is one Project.
- The WebSocket server accepts only the app's own origins.

### Replica (std-toolkit)

Caught Up, per Collection and per Window, exposed to Queries. The app shows
stored rows at once with no loading state; with none, a skeleton until Caught
Up; after that an empty list is believed. `useSettled` and its timer go.

### Device State and the top-level guard

One IndexedDB store, through std-toolkit's idb db, for this browser only:
Bindings, Vim Mode (moved from localStorage) and Unseen marks, in its own
deep module under `shell/`. The root actor reads it in its init, before
anything is drawn; the Keys Provider gets the Bindings from it. The app's tree
is one obvious chain: Device State, then the connection and Replica, then the
pages.

### Shortcut settings

Settings lists every Action from the typed keys definition, grouped by
Surface, with a search field. A row shows its label and keys; clicking it
records one key press (single chords; sequences keep their defaults), which
replaces the Action's keys. A clash on the same Surface says which Action
holds it and offers Swap; a key only Shadowed by a nearer Surface is allowed
with a note. use-keys gains a pure, non-throwing conflict check. Reset per row
and Reset all. The `?` help sheet shows the same Bindings.

### Layout: a feature map

```
apps/code/src/
  app.tsx  document.tsx  keys.ts
  replica/      Projects, Sessions, Messages Queries
  places/       every place's address; views link through it, never the router
  ui/           picker/, mark/, theme/, time/, status-dot/
  shell/        actor.ts view.tsx — the root page
    device-state/  header/  sidebar/ (settled-list/)  background-jobs/
    project-picker/ (folder-picker/)  session-switcher/  session-actions/
    settings/ (shortcuts/)
    project/    actor.ts view.tsx — /p/:id, a new Session in this Project
      composer/  model-picker/
      session/  actor.ts view.tsx
        transcript/
```

Each feature owns the server calls it makes (an `api.ts` beside its actor);
the shared `ai/commands.ts` goes. Only the root page imports the router.
`laymos.config.json` shrinks to the few Rules this tree needs. Only the
project pages use the composer and model picker. `start({ app: 'src/app' })`.

## Tasks

Phase 1 runs in parallel; each task stays inside its own package.

1. **ai-toolkit server**: everything under "Server (ai-toolkit)".
2. **Replica Caught Up**: std-toolkit.
3. **use-keys**: the focus rule and the conflict check.
4. **Layout move**: apps/code into the feature map with no change in
   behaviour; views link through `places`.

Phase 2 runs in order, each on the last one's result.

5. **Picker**: `ui/picker`; skills and model onto it (Ctrl+M); Base UI focus
   return off; the focus rule adopted; the composer's focus hacks removed;
   Caught Up replaces `useSettled`.
6. **Device State, guard and shortcut settings**.
7. **Project Picker, Session Switcher, Session Actions** and the new app keys
   (Ctrl+P, J, K, N, B, comma).
8. **Sidebar, Settled List, Unseen, Fork display**.
