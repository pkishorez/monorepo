# Road

Status: works. Not a Foldkit port: this is Effect Oak's own first demo, moved
to `/demos/effect-oak/road` (the old `/demos/effect-oak` redirects here).

## Nodes

```
Game        Welcome → Playing ⇄ Paused, then Crashed
  Playing   Lifetime sends CarSpawned; each Update plans Collided as a
            Command (replaceCommands: the latest plan wins)
  Paused    PressedPause (P or the Pause button) drops the crash plan;
            pressing it again moves every Time in the road on by the pause
scene/      the SVG road, moved at each Frame by motion values; not a Node
```

The road, your car and the oncoming cars move between Messages. The View works
out where they are at each Frame from the Model and the Time, with
`useTransform(frame, …)` on `motion.g` elements (ADR 0006). A minute of
driving is a handful of Messages, and Replay steps through them: each Step
draws the road at that Message's Time.

The Runtime has no Pause (ADR 0006), so the game pauses itself: Paused is a
State, and the road stands still at the Time it was paused. While Replay
shows the past, the live game drives on.

## Blockers

None.

## Testing

Not from Foldkit. The Update is pure (`laneAt`, `aheadAt` and `crashAt` are
plain functions), so a typed `Node.step` (see
[../counter/notes.md](../counter/notes.md)) and named Commands (see
[../todo/notes.md](../todo/notes.md)) would let a test check "steering out of
the way replaces the Collided plan" without running anything.
