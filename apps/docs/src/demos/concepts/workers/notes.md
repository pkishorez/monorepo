# 6. Workers

Status: works

## What it shows

A Worker: work that runs for exactly as long as its Condition holds. The
Clock Actor owns one Worker per kind of Condition, each a Ring around the
Circle while it runs:

- `tick`: owned by the Instance itself. Ticked every second, for as long as
  the Clock exists.
- `run`: owned by the Running State (written in its block). Ran every 250 ms,
  counted in the State's data `{ since, ran }`; a Ran is new data in the
  same State, not a Transition, so the Ring stays.
- `blink`: owned by a yes or no (`while: model.armed`). Blinked every 400 ms
  flips `model.blink`.
- `countdown`: one per key (`each: model.countdowns`). CountedDown 3 s after
  the key was added; the Update removes the key, which closes the Worker's
  Scope and runs its Finalizer. The Finalizer only logs; it never Sends.

Every Worker works out its wait from the Time (`self.now`) and the Model, so
a resume or a fork waits only what is left.

## What to click

- The Circle: Toggle, Stopped and Running. The Circle slides between the two
  Slots; the `run` Ring appears in Running and shrinks away on leaving.
- Chip Arm/Disarm: the `blink` Ring appears and goes.
- Chip Add countdown: a `countdown/cN` Ring that shrinks away 3 s later as
  its Finalizer runs.

## What to watch

- Strip: worker-coloured Marbles at a steady beat per Ring; a Toggle or
  Disarm (view-coloured) is the last Marble before a beat stops.
- Devtools: each Message's Source names its Worker and key
  (`worker Clock countdown c1`). Stop and resume, or fork from an earlier
  Step: the next beat lands at the same Time it would have live.
