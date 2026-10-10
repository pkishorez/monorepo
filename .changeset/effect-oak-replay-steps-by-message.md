---
'effect-oak': patch
---

Breaking: Replay steps by Message, and the Frame is a motion value (ADR 0006). `Replay.seek(step)` takes a Step (0 is right after init, N right after Message N) instead of a Time. Every View gets `frame`, a Framer Motion `MotionValue<number>`, next to `node`, and hands it to its Children's Views; `useFrame` is gone, so move things with `useTransform(frame, …)` or draw a canvas from `useMotionValueEvent(frame, 'change', …)`. There is no Pause: `Running.pause`/`resume` are gone, and Commands and Lifetimes sleep on Effect's own Clock. `App.useRuntime()` returns `{ log, shown, show, frame }` and replaces `useTimeTravel`, `useLog` and `useRoot`. One Runtime per `toReact` is shared by every mount: the first mount starts it, the last unmount stops it. `motion` is a new peer dependency.
