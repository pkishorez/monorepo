# Canvas art

Status: works. No ticks: a minute of bouncing is only the clicks.

## What was ported

Foldkit's `canvas-art`: click the canvas to launch a ball of random size,
color, speed and heading; balls bounce off the walls; Pause/Play and Clear.

```
Box (one Node)                 Model { balls: [{ x, y, vx, vy, radius, color, launched }], nextId }
  Running { before, since }    ClickedTogglePlay → Paused { clock }
  Paused { clock }             ClickedTogglePlay → Running
  either                       ClickedCanvas → Command (Random) → CompletedGenerateBall
board/         the canvas, painted at each Frame from where each ball is; not a Node
../frame-canvas/   a 2D canvas painted at every Frame, shared with generative-art
```

The box keeps its own clock, which stops while Paused, the way the stopwatch
does. A ball keeps where and when (by that clock) it was launched. Where it is
at any reading of the clock is a formula (`ballAt`): the free path folded back
into the box (`bounce.ts`). The View works it out at each Frame (ADR 0005).

## Deviations

- **No `TickedFrame`.** Foldkit sends a Message every animation frame and
  Update moves every ball. Here Update never moves anything; the View does,
  at each Frame, painting the canvas from `useMotionValueEvent(frame, …)`.
  The Log has only clicks, and each Step of Time Travel shows the balls at
  that Message's Time.
- Running and Paused are States, not an `isRunning` flag. Clicking while
  Paused still launches a ball, which waits until Play, as in Foldkit.
- A bounce is a perfect reflection. Foldkit clamps the ball to the wall and
  flips its velocity, which loses a little distance at each bounce.
- `Canvas.view` from Foldkit is replaced by a plain `<canvas>` painted
  through its 2D context, scaled for the screen's pixel ratio.

## Blockers

None. One Node is the right size: the balls are data, and there is nothing
else to own. (They could not be Child Nodes anyway: blocker 1.)

## Testing

Foldkit's stories click the canvas, check `Command.expectHas(GenerateBall)`
and resolve it with a chosen `CompletedGenerateBall`. They step `TickedFrame`
and check that a ball moved and bounced. Its scenes check the heading, the
Pause/Play label and the ball count.

What Effect Oak would need:

- Named Commands to check and resolve `GenerateBall` (roll-up blocker 4).
- Nothing to step frames: motion is `ballAt(ball, clock)`, a plain function a
  test can call at any clock reading. A typed `Node.step` (blocker 5) covers
  the rest.
- Drawing the View at a given Time (blocker 5), to check what the canvas
  shows. A canvas has no DOM to query, so the test would read pixels or
  check the `ballsAt` the board was given.
