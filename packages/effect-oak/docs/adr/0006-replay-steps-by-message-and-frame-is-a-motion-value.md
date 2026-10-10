# Replay steps by Message, and the Frame is a motion value

Supersedes the parts of ADR 0005 that seek by Time, pause the app's Time and draw through `useFrame`. Time stays in the Message.

Time Travel shows the app at a step: step 0 is right after init, step N right after Message N. The tree is the Replay of Messages 1..N, drawn at Message N's Time. Nothing between two Messages is ever shown in the past: the Messages are the facts, and motion between them is only drawing.

Every View gets `frame`, one Framer Motion `MotionValue<number>` for the whole app, holding the Time the Views are drawn at. While live, an animation-frame loop sets it to the Runtime's Time now. At step N it stands still at Message N's Time. Views turn it into positions with `useTransform` (or listen with `useMotionValueEvent` to draw a canvas), so motion between Messages costs no React render. React renders only when a Message changes an Instance, and `useTransform` recomputes during that render with the new Model.

There is no Pause. While the past is shown, the live app keeps running underneath, and Views of the past cannot Send. An app that must stand still, like a game, pauses itself with its own Messages.

Outside the tree, `App.useRuntime()` gives the Log, the step shown (`null` for live), a way to show a step or go live, and `frame`. Timelines and devtools are built on it. Views never see it, so a View of the past cannot read the live Log.

## Considered Options

- **Seek by Time, with a pausable clock (ADR 0005)**: rejected. Scrubbing between Messages needed a clock that Commands and Lifetimes sleep in, a Pause that wakes every sleeper, and a `useFrame` that redraws after every render. The motion it showed was only drawing.
- **A tick Message every frame, as in Foldkit**: rejected for the reasons in ADR 0005. Foldkit itself has to keep frames out of its history (`excludeFromHistory`) and fall back to Model snapshots.
- **A `useTime()` hook that re-renders**: rejected. Every animation frame re-renders the caller and everything below it.
- **Our own `{ get, subscribe }` value**: rejected. Framer only animates its own `MotionValue`, so every app would need an effect to bridge them.
- **The runtime handle in every View**: rejected. A View of the past would read the live Log, and a timeline inside the tree would replay its own scrubbing.

## Consequences

- `effect-oak/react` has `motion` as a peer dependency.
- Update still gets `at`, and Replay gives it the same `at`, so motion stays deterministic.
- Commands and Lifetimes use Effect's own Clock.
- A View computes its first position during render (`useTransform` does), so a new Model never shows for a frame at an old position.
- One Runtime per `toReact`. Every mount of the app shows it; it starts with the first mount and stops with the last.
