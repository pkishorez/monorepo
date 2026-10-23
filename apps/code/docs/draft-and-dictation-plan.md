# Single keys, the Draft, every Machine, Dictation: the plan

The decisions from the design session, and the order they are built in. It
replaces `keyboard-first-plan.md`, whose tasks are done. Words are defined in
[`../CONTEXT.md`](../CONTEXT.md),
[`toolkits/ai-toolkit/CONTEXT.md`](../../../toolkits/ai-toolkit/CONTEXT.md),
[`toolkits/std-toolkit/src/replica/CONTEXT.md`](../../../toolkits/std-toolkit/src/replica/CONTEXT.md)
and [`packages/use-keys/CONTEXT.md`](../../../packages/use-keys/CONTEXT.md).
The decision records are ai-toolkit's ADR
[0017](../../../toolkits/ai-toolkit/docs/adr/0017-speech-to-text-runs-on-the-machine.md)
and [0018](../../../toolkits/ai-toolkit/docs/adr/0018-an-app-is-on-every-machine-at-once.md).
Delete this file once every task is done.

## Ground rules (every task)

- Read the `CONTEXT.md` files above and use their words in code, comments and
  docs. Match the surrounding code's comment density, naming and idiom.
- Load the `laymos` and `deep-module` skills before moving or creating a
  module in apps/code. Every folder there is a deep module: a narrow
  `index.ts` over a mandatory main file, with the Page folder exception in
  `apps/code/README.md`. apps/code is not yet laid out as Kabuki Actor
  folders; do not start that move.
- In ai-toolkit's `src/kabuki/`, follow `~/.claude/skills/kabukifi/LAYOUT.md`
  and `CONCEPTS.md` (read them whole), and update
  `toolkits/ai-toolkit/docs/kabuki-tree.md` to match the tree after the
  change, in its own voice.
- No hacks: no timers to guess state, no `requestAnimationFrame` focus, no
  `preventDefault` on mousedown to keep focus, no casts to silence types.
- The database is started fresh: no migrations, no `evolve` steps for old
  rows, no code that tidies old data. Saved Bindings for Actions that no
  longer exist are ignored.
- Every changed package gets a changeset in `.changeset/`, bump `patch`
  (packages are 0.x, breaking changes included), written like the existing
  ones. READMEs follow `docs/readme-conventions.md`.
- Do not commit. Finish with the package's `lint` and `test` scripts green
  (`pnpm --filter <pkg> lint`, `pnpm --filter <pkg> test`); say plainly what
  fails if something outside your task breaks them.

## Decisions

### Keys (apps/code `keys.ts`)

The keyboard is always on: the Vim Mode toggle and its Device State go, and
every Action works as `always` did. Plain letters work in Normal Mode; only
the keys marked "everywhere" work while typing in the Composer or a Picker.

| Key               | Does                                                       |
| ----------------- | ---------------------------------------------------------- |
| `j` / `k`         | scroll the page; rows in the sidebar                       |
| `h` / `l`         | the sidebar / the page                                     |
| `i`               | edit the Draft: it becomes the Composer                    |
| `Enter`           | send the Draft, when it has text (on the page)             |
| `Space`           | start or stop a Dictation (not where Space types)          |
| `Ctrl+Space`      | start or stop a Dictation, everywhere                      |
| `u`               | undo the last thing put into the Draft                     |
| `/`               | the skills Picker; the skill goes in at the Draft's cursor |
| `m` / `p` / `e`   | the model Picker at the model / permissions / effort       |
| `o`               | the Project Picker                                         |
| `s`               | the Session Switcher                                       |
| `a`               | Session Actions                                            |
| `n`               | a new Session in this Project                              |
| `b`               | show or hide the sidebar                                   |
| `[` / `]`         | previous / next Session in the sidebar                     |
| `g g` / `shift+g` | top / bottom                                               |
| `?`               | the keys                                                   |
| `Ctrl+,`          | Settings, or back from them (everywhere)                   |
| `mod+.`           | stop the Turn (everywhere)                                 |
| `Escape`          | the Escape order, unchanged; never touches a Dictation     |

The Ctrl versions of these (`ctrl+p/j/k/n/b/m/h/l`) and `Space e` go. Picker
keys inside the `picker` Surface stay as they are.

### The Draft (apps/code)

- The open Session's next message sits in one card with the Status Line,
  pinned to the page's foot while the transcript scrolls above it; always
  visible. A long Draft scrolls inside the card.
- It is read-only: it can be scrolled, clicked to place a cursor, and dragged
  to select (CodeMirror with the state read-only, so the selection stays).
  `i` makes it editable in place: the Composer. Escape makes it read-only
  again and keeps the text, cursor and selection.
- Everything put into the Draft goes in at its cursor, replacing a selection:
  a Dictation, a paste, a dropped file, a Skill. Pasting or dropping anywhere
  on the page goes to the Draft. After each insert the cursor sits after it,
  the page scrolls it into view, and the inserted text fades from a
  highlight in about a second (no fade with reduced motion). In an untouched
  Draft the cursor is at the end.
- `u` (and Cmd+Z in the Composer) undoes the last insert, whatever it was.
- On a Project's new-session page the Draft sits where the first message
  goes; sending it starts the Session.
- The Status Line at the page's foot shows the model and permissions, a mic
  button (start or stop a Dictation) and a send button.

### Every Machine at once (ai-toolkit client, apps/code)

- Each Machine's `Ai` Instance opens its own Machine's socket, found by its
  key; `AiLive` no longer takes one `AiClient` from context. The app holds an
  Instance for every Machine in the Machine List, opens one when a Machine is
  added, and closes one and deletes its local database when it is forgotten.
- App Queries read across every Instance; each row says its Machine.
  `CurrentMachine` goes. The Machine Switcher goes.
- The shell (sidebar, Pickers, Settings) is at the root. Only a Session's
  address names its Machine: `/m/:machineId/s/:sessionId` or the code's
  equivalent.
- The sidebar is one list of Projects; each shows its Machine's name in small
  text after it, hidden with only one Machine. A Machine that does not answer
  keeps what it last synced, marked by its Last Seen.
- The Project Picker's first Step picks the Machine, skipped with only one.
- Settings is at the root. Its Machines list comes from the Machines Backend
  alone and draws at once. Each Machine has its own settings (its Harness
  Binaries, its Speech to Text switch), each loading on its own; one that
  does not answer says so in its own row.
- Screens draw from the local copy at once. A loading state, a quiet
  skeleton shaped like the content and never a spinner, shows only for data
  this device has never synced, and the Replica reports that, not an empty
  list.

### Speech to Text (ai-toolkit)

- A `SpeechToText` service: 16 kHz mono PCM in, text out. sherpa-onnx
  (`sherpa-onnx-node`, `OfflineRecognizer`) with Parakeet TDT 0.6b v2 int8
  from the `asr-models` GitHub release is one implementation, behind one
  typed wrapper; a fake implementation serves tests. One real test runs only
  when the model is already on disk.
- A seventh contract group, `speech`, merged into `AiApi` (ADR 0004):
  `enableSpeechToText` (returns at once), `disableSpeechToText`,
  `watchSpeechToText` (a stream: the state now, then every change: off,
  downloading with bytes of total, ready, failed) and `transcribe` (a typed
  failure when not ready).
- On is a wish the Machine keeps in its data folder. It downloads the model
  there, starts again after a restart, shows failed with a retry, and off
  deletes the files. The model loads on first `transcribe` and stays loaded.

### Dictation (apps/code)

- Space or Ctrl+Space starts it and stops it; the mic button too. It carries
  on while the user moves around the app, the Composer included. Its text
  goes into the Draft of the Session open when it stops.
- The browser records raw PCM through an AudioWorklet, mono at 16 kHz, and
  sends the whole clip in one `transcribe` when it stops. It stops itself
  and transcribes at 5 minutes.
- It transcribes on the open Session's Machine when that has Speech to Text
  on, else on any Machine that has it on and answers.
- While it records, a mic badge sits in a corner above everything, Pickers
  and dialogs included, with the time and a level. When it stops, a
  "transcribing…" placeholder sits at the Draft's cursor until the text
  arrives. If transcribing fails, the placeholder becomes "couldn't
  transcribe — retry", and the last clip stays in memory until the next
  Dictation.
- When it cannot start (the mic is denied, there is none, or no Machine has
  Speech to Text on), the badge says why for a few seconds.
- Settings shows each Machine's Speech to Text switch with its live state
  from `watchSpeechToText`, download progress included.

## Tasks

Phase 1 runs in parallel; each task stays inside its own package.

1. **Keys and the Draft**: apps/code, "Keys" and "The Draft", without
   Dictation (Space, Ctrl+Space and the mic button come in task 4).
2. **Speech to Text**: ai-toolkit, "Speech to Text", with `kabuki-tree.md`.

Phase 2 runs in order, each on the last one's result.

3. **Every Machine at once**: ai-toolkit's client first, then apps/code.
4. **Dictation**: apps/code, "Dictation".
