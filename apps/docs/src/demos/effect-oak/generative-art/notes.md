# Generative art

Status: partial. The particles are stepped in the View between Messages, with
no ticks; the sliders are not Nodes (blockers below).

## What was ported

Foldkit's `generative-art` ("Prism Field"): about 55 glowing particles carried
by a drifting Perlin flow field, a swirl around the pointer, a burst of 22 on
click, Pause/Play, Reset, and Turbulence and Noise scale sliders.

```
Prism (one Node)               Model { particles, nextId, flowStrength, noiseScale, pointer }
  Running { before, since }    Lifetime: every 500 ms, 4 random seeds → CompletedGenerateAmbient
  Paused { clock }
  any                          every Update first settles the particles to `at`
                               PressedCanvas → Command (Random) → CompletedGenerateBurst
flow/    the physics: noise, the field, `advance` (step a particle on) and `settle`
sky/     the canvas: carries particles on to each Frame and paints them; not a Node
seeds.ts random new particles, for Commands and the Lifetime
```

## How motion works without ticks

A particle's path depends on the whole field it went through, so there is no
formula for where it is: it has to be stepped. The Model keeps each particle
as of its last step (`from`, on the field's own clock) with its trail. Every
Update first `settle`s them: steps each one on to the Message's Time through
the field as it was, and drops the gone ones. Only then do the sliders, the
pointer or the particles change. The View steps them on from there to each
Frame with the same `advance`, in fixed 1/60 s steps of the clock, so Replay
draws exactly what the live app drew.

Stepping from the Model at every Frame would redo the whole way since the last
Message. The Sky remembers how far it got for each particle and goes on from
there. A particle it has not seen, or a Frame earlier than it got to (a
Step back in Time Travel), starts again from the Model.

## Deviations

- **No `TickedFrame`.** Foldkit sends a Message per animation frame and steps
  in Update. Here about 2 ambient Messages a second, plus clicks, pointer
  moves and sliders.
- **Ambient particles come from a Lifetime**, 4 every 500 ms, and are taken
  only while there are fewer than 55. Foldkit asks for up to 3 new ones per
  frame. The rate here is about what fades.
- Running and Paused are States, with a clock that stops while Paused (as in
  the stopwatch); the nebulae stop too.
- Foldkit's `@foldkit/ui` Slider (a Submodel with drag Subscriptions) is the
  web-platform Slider sending `ChangedFlowStrength` / `ChangedNoiseScale`.
- One `CompletedGenerate…` Message carries all the seeds of a burst; Foldkit
  sends 22 Commands and gets 22 Messages.
- Every pointer move is a Message, as in Foldkit. Each settles every
  particle, which is cheap because they were settled a moment ago.

## Blockers

- **The sliders cannot be Child Nodes.** A slider Node (its value, reported up
  by Request like the form's fields) would have to live in both Running and
  Paused, and Children belong to one State (roll-up blocker 10). It would be
  created anew at every Pause, and could not start from the current value
  (blocker 3). Putting Running/Paused into the Model instead would lose the
  Lifetime, which belongs to a State. So the Node is one, and the sliders are
  plain controls sending its Messages.

## Testing

Foldkit's stories toggle play, reset, move the pointer, append generated
particles, and step `TickedFrame` while resolving the ambient spawn Commands
(`Command.resolveAll`). Its scenes check the buttons, the counter and that the
sliders are labelled.

What Effect Oak would need:

- Named Commands to resolve the burst (roll-up blocker 4), and emitting the
  ambient Lifetime's Message by hand (blocker 6).
- A typed `Node.step` (blocker 5). `flow/` is plain functions: "a particle
  stepped to 1000 then to 2000 is where it is stepped straight to 2000" can be
  tested today.

## Also surprising

- Path-dependent motion fits ADR 0005, at a price: the physics runs in two
  places (Update to settle, the View to draw), and the View needs a cache to
  stay cheap. The Model holds each trail, so it is larger than Foldkit's would
  be between frames.
