# Spec: Stories, rebuilt

Glossary: `devtools/laymos/CONTEXT.md` (Story, Telling, Reader, Proof,
Self-contained, Preparation, Action, Verification, Venue, Device, Tab, Step,
Gesture, Recording, Evidence, Critical, Story tree, Story id, Proof id, Proof
report, Stories canvas, Stories run). Read it first. Every name below comes from it.

## The model

A **Story** is one idea told to its **Reader** in plain, conversational
English. Stories form a tree that teaches the Project from its pitch down to
its edge cases. On disk a Story is a folder beneath the Stories path:

```
stories/                         std-toolkit                    (top Story, id = project folder name)
  story.md                       its Telling: the pitch, how the parts connect
  data-survives-new-versions.proof.ts   an end-to-end Proof of the top Story
  evolving-schema/               std-toolkit/evolving-schema    (a sub-Story)
    story.md
    old-rows-still-read.proof.ts std-toolkit/evolving-schema/old-rows-still-read (a Proof id)
    migrations/                  std-toolkit/evolving-schema/migrations
      story.md
      ...
```

- **Telling** (`story.md`): first `#` heading = title; first paragraph = pitch
  (shown on the closed card); the rest = body (shown when opened). Written
  per `devtools/laymos/docs/writing-stories.md`.
- **Links in a Telling**: a markdown link whose target is not a URL is a Story
  id or Proof id, absolute, same Project: `[define a shape](std-toolkit/evolving-schema)`.
  The order a Telling first links its sub-Stories (and Proofs) is the order
  they are shown; unlinked ones come last by name.
- **Telling issues** (in the tree, reported by `laymos lint`, shown in the UI):
  `missing-telling`, `incomplete-telling` (no title or no pitch),
  `broken-link` (rendered inline in red in the markdown: "no Story `…`"),
  `unnamed-part` (a sub-Story the Telling never links).
- **Proof**: the one-claim file (`*.proof.ts` / `*.proof.tsx`), unchanged in
  substance: Preparation, Action, Verification, Evidence, Critical. One file,
  one default export. Imports only what the Project ships, `effect`, and
  `laymos/story`. **No relative imports.** Each run replaces its previous
  report. Proof titles are plain sentences a Reader cares about.
- Proofs sitting directly in a Story prove that Story: at the top, end-to-end
  integration of the parts; deeper, one part's claims and edge cases.

Contract (written, do not change shapes without telling the lead):
`devtools/laymos/src/story/schema/story-tree-schema.ts` (StoryNode,
ProofLeaf, TellingIssue) and `proof-report-schema.ts` (ProofReport,
ProofRunEvent, …; renamed from Story*).

## Authoring API (`laymos/story`)

```ts
import { Effect, Scope, Duration } from 'effect';

type Phase<A> = Effect.Effect<A, unknown, StoryContext | Scope.Scope>;

Proof.make<S, O>(definition: {
  readonly title: string;
  readonly description?: string;
  readonly critical?: boolean;
  readonly timeout?: Duration.Input;           // default: config storyTimeout ?? 10 seconds
  readonly prepare: Phase<S>;
  readonly act: (state: S) => Phase<O>;
  readonly verify: (output: O, state: S) => Phase<void>;
}): Proof;                                      // venue 'process'

Proof.browser<S, O>(definition: {
  readonly title: string;
  readonly description?: string;
  readonly critical?: boolean;
  readonly timeout?: Duration.Input;           // default: 60 seconds
  /** Runs in the page. Mounts what the Story exercises into `root`; may return a cleanup. */
  readonly page: (root: HTMLElement) => void | (() => void);
  readonly prepare: (browser: Browser) => Phase<S>;
  readonly act: (state: S) => Phase<O>;
  readonly verify: (output: O, state: S) => Phase<void>;
}): Proof;                                      // venue 'browser'

Proof.assert(description: string, passed: boolean): Effect<void, never, StoryContext>;

/** Asserts every span named `span` recorded so far ended within `max`. A missing span is a false assertion. */
Proof.budget(span: string, max: Duration.Input): Effect<void, never, StoryContext>;
```

All three phases run inside one `Effect.scoped`, so resources a Preparation
acquires (`Layer.build`, scoped services) live until Verification ends. The
whole run is traced: one root span `Story`, child spans `prepare`, `act`,
`verify`, and one span per Step. Spans from the code under test (in the
process Venue) land beneath them.

Verdict:

- `unprepared`: a Preparation assertion was false, or Preparation died. Action and Verification are `skipped`.
- `errored`: Action or Verification died, or the Story timed out.
- `failed`: an Action or Verification assertion was false.
- `passed`: otherwise.

Each phase's returned value is converted to JSON and kept as Evidence
(`PhaseReport.value`). Authors return what a reader should see: the row as
stored, the migrated value, the list on screen.

### Browser Venue

```ts
interface Browser {
  /** Opens a new Device (own storage) with its first Tab. */
  readonly open: (device?: 'desktop' | 'mobile', name?: string) => Effect<Tab>;
}

interface Device {
  readonly kind: 'desktop' | 'mobile';
  /** Opens another Tab on this Device: same storage, same origin. */
  readonly open: (name?: string) => Effect<Tab>;
}

interface Tab {
  readonly name: string;                       // default 'Tab 1', 'Tab 2', … across the Story
  readonly device: Device;

  // Steps: each is recorded with its name, Tab, phase, and timing.
  readonly click: (name: string, target: string) => Effect<void>;
  readonly type: (name: string, target: string, text: string) => Effect<void>;
  readonly press: (name: string, ...keys: string[]) => Effect<void>;   // Playwright key names, pressed in order: 'Meta+K', 'g', 'g'
  readonly scroll: (name: string, to: string | { readonly y: number }) => Effect<void>;
  readonly gesture: (name: string, gesture: Gesture) => Effect<void>;
  readonly waitFor: (name: string, target: string) => Effect<void>;
  readonly screenshot: (name: string) => Effect<void>;
  readonly raw: <R>(name: string, run: (page: unknown) => Promise<R>) => Effect<R>; // escape hatch, reported as unanimated
  readonly close: (name: string) => Effect<void>; // closes the page; its Recording ends here

  // Reads: not Steps.
  readonly text: (target: string) => Effect<string>;
  readonly count: (target: string) => Effect<number>;
  readonly evaluate: <R>(fn: () => R) => Effect<R>;
}

// Gestures: every finger moves along its own path over `duration`.
Gesture.tap(target: string): Gesture;
Gesture.press(target: string, duration?: Duration.Input): Gesture;
Gesture.swipe(target: string, direction: 'up' | 'down' | 'left' | 'right', options?: { distance?: number; duration?: Duration.Input; fingers?: number }): Gesture;
Gesture.drag(from: string, to: string | { x: number; y: number }, options?: { duration?: Duration.Input }): Gesture;
Gesture.pinch(target: string, scale: number, options?: { duration?: Duration.Input }): Gesture;
Gesture.rotate(target: string, degrees: number, options?: { duration?: Duration.Input }): Gesture;
Gesture.fingers(paths: ReadonlyArray<ReadonlyArray<{ x: number; y: number; t: number }>>): Gesture; // page coordinates, t in ms
```

`target` is a Playwright selector (`text=Save`, `[data-testid=x]`, `role=button[name="Add"]`, CSS).

## Runner behaviour (laymos)

- **Discovery**: every folder beneath (and including) the Stories path is a
  Story; its `story.md` is parsed as the Telling; `*.proof.ts(x)` directly in
  it are its Proofs (default export must be a Proof). Building the tree from
  files + Tellings (ids, ordering by links, issues) is pure. Loading the tree
  imports Proof files but runs nothing.
- **Scope**: a run covers everything, one Story id (that Story and everything
  beneath it), or one Proof id.
- **Concurrency**: process Stories run concurrently (default 16); browser
  Stories run on one shared Chromium, at most 2 at a time.
- **Evidence folder**: `<project>/.laymos/stories/<proof id>/`. Deleted at the
  start of that Proof's run. `report.json` written at the end. Recording frames
  at `<tab-slug>/<n>.jpg`, step screenshots at `steps/<n>.jpg`. `.laymos/` is
  gitignored at the repo root.
- **Saved reports**: `loadStoryReports(configPath)` reads every `report.json`
  that still matches a Story in the tree.
- **Page host**: for browser Stories, one Vite dev server per project per run,
  `root` = project folder, using the project's `vite.config.*` if present, on a
  free port. It serves `/__laymos/story/<id>` as an HTML page whose module
  imports the Story file and calls `story.page(document.getElementById('root'))`.
  Story files must therefore be importable in the browser (no Node-only
  top-level imports), and in Node (laymos imports them for metadata).
- **Devices**: `desktop` = 1280×800, no touch. `mobile` = Playwright's
  `Pixel 7` descriptor (touch, mobile, DPR). Chromium only.
- **Recording**: per Tab, CDP `Page.startScreencast` (jpeg, quality ~80);
  every frame is written with its time on the Story clock. Raw, untrimmed.
  No ffmpeg.
- **Human pace** (the footage is the Evidence, so there is no fast mode):
  ~700 ms rest after each Step; typing ~100 ms per key; mouse moves
  500–900 ms; a mobile tap is a visible ≥150 ms hold; Gestures last at least
  ~1 s unless the Proof asks for a shorter duration.
- **Readable motion** (injected init script + runner pacing):
  - a pointer overlay drawn on desktop Tabs that follows real mouse moves;
    the runner moves the mouse along an eased path (~300–600 ms, ~60 fps)
    before each click, and shows a press ripple;
  - finger dots on mobile Tabs for every active touch point, driven by real
    touch events; clicks on mobile become taps;
  - scrolling is smooth and the Step waits for it to settle;
  - typing is paced (~40 ms per character);
  - `press` shows a short key badge (e.g. `⌘ K`) so keyboard Stories read on
    video;
  - the overlay never takes pointer events.
- **Gestures**: CDP `Input.dispatchTouchEvent` with all touch points per frame,
  interpolated at ~60 fps over the Gesture's duration.
- **Reports**: one `StoryReport` per Story (schema already written).
  `runStories` streams `StoryRunEvent` (`Started`, then `Finished` with the
  report).

## CLI

`laymos stories [scope] [-c concurrency]`: runs, prints the Story tree (titles) with
✓ passed, ✗ failed, ! errored, ○ unprepared, Critical Stories marked, and a
summary. Exit 1 if any Story did not pass.

`laymos lint` reports a Proof file with a relative import (Self-contained) and
every Telling issue as violations.

## Devtools

- RPC: `GetLaymosStories` → `StoryTree`; `GetLaymosStoryReports` → saved
  `ProofReport[]`; `RunLaymosStories({ projectPath, scope? })` → stream of
  `ProofRunEvent`.
- HTTP: `GET /story-evidence?project=<abs project path>&proof=<id>&file=<relative file>`
  serves one Evidence file; refuses anything outside that Proof's Evidence folder.
- The Stories tab in the Laymos workspace (shared by the Laymos Tool and
  Monoverse) shows the Stories canvas.

## Stories canvas (devtools/ui)

Replaces the React Flow canvas entirely. Plain DOM, `motion` (layout
animations), `@kstackz/use-gesture` for pan/pinch/drag. Remove `@xyflow/react`
from devtools/ui if nothing else uses it.

- **A space to explore**: a bounded, freely pannable 2D space (drag empty
  space, wheel/trackpad pan, pinch or ctrl-scroll zoom). Bounds = content plus
  a margin.
- **One rule: a click opens what you clicked, in place; clicking it again
  closes it.** No right-click, no modes. The space holds only Stories.
- **Mind-map layout growing rightward**: the top Story card first. Clicking a
  closed Story card opens it: it grows to show its Telling (rendered
  markdown, Story/Proof links clickable, broken links red inline with
  "no Story `…`"), and its sub-Stories appear as cards to its right in
  Telling order. The open cards always form one path from the top Story:
  opening a card closes its siblings and everything not on its path;
  collapsing a card closes it and everything beneath it. Opening and
  collapsing glide the camera so the card plus its visible sub-Stories sit
  centred horizontally and a little above the middle (~40% height), at the
  current zoom. Pan bounds: up to 80% of all cards may leave the screen. No
  card is wider than the screen.
- **Story card**: closed = title, pitch, one rolled-up result dot (green: all
  pass beneath; red: any failure; red ring: a Critical failure; grey: not
  run; animated while running) and a run button. Open = the Telling, then a
  **"Proved by N · x ✓ y ✗"** footer (only if the Story has Proofs of
  its own), unfolded by default; clicking it folds the Proof list: each
  row = claim, verdict dot, Critical mark, venue icon, run button; linked
  Proofs first in link order, then the rest. Clicking a row opens the Proof
  panel. Proofs are never cards in the space.
- **No card dragging**: cards are always auto-laid out; dragging anywhere
  pans the whole space. Opening or collapsing a Story card never moves that
  card on screen; everything else moves around it.
- **Keyboard**: arrows move between cards, Enter opens/closes.
- **Proof panel**: opening a Proof opens a wide side panel over a blurred,
  dimmed space (clicking the blur closes it; Space plays/pauses, Esc closes): the Recordings
  get most of the height, phases/assertions/value below, then the trace and
  the Proof file. Player: speed 0.5× / 1× / 2× (1× = real time); a
  full-screen toggle (button or `F`, `Esc` returns) showing every Tab side by
  side, the Step timeline beneath, and the current Step's name over the video.
- Saved reports load when the tab opens; runs animate cards (Started →
  running, Finished → verdict).

## Old Stories

Deleted everywhere: std-toolkit, auth-toolkit, effect-webrtc, laymos fixtures.
`Story.flow`, `Story.trace`, `Story.question`, `Story.group`, support files,
Story pages, spine, snippets: gone. laymos no longer depends on `@kstackz/flow`.

## The Story trees

Re-cut by idea, not by API, each Telling written per the guidelines, Proof
titles rewritten as Reader-facing sentences:

- `toolkits/std-toolkit/stories/`: top Story (pitch + end-to-end Proofs),
  parts `evolving-schema/` (with `migrations/`, `snapshot/`), `entities/`
  (many of a kind = std-entity, exactly one = std-single-entity),
  `adapters/` (tables = std-table, including writing several changes
  together), `sync/` (browser).
- `packages/use-keys/stories/`, `packages/use-gesture/stories/`,
  `platforms/web-platform/stories/`: same treatment.
