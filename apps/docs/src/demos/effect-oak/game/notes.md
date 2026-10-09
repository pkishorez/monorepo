# Road

Status: works. Not a Foldkit port: this is Effect Oak's own first demo, moved
to `/demos/effect-oak/road` (the old `/demos/effect-oak` redirects here).

## Nodes

```
Game        Welcome → Playing → Crashed
  Playing   Lifetime sends CarSpawned; each Update plans Collided as a
            Command (replaceCommands: the latest plan wins)
scene/      the SVG road, moved at each Frame through refs; not a Node
```

The road, your car and the oncoming cars move between Messages. The View works
out where they are at each Frame from the Model and the Time (ADR 0005). A
minute of driving is a handful of Messages.

## Blockers

None.

## Testing

Not from Foldkit. The Update is pure (`laneAt`, `aheadAt` and `crashAt` are
plain functions), so a typed `Node.step` (see
[../counter/notes.md](../counter/notes.md)) and named Commands (see
[../todo/notes.md](../todo/notes.md)) would let a test check "steering out of
the way replaces the Collided plan" without running anything.
