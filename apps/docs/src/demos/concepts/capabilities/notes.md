# 7. Capabilities

Status: works

## What it shows

Requires, Provides and a Request. The Board Provides the `Scores`
Capability (`total`, a projection of its Model, and `add`, a Request). Each
Scorer Requires `Scores` and never learns who Provides it.

```
scores.ts        Scores: Context.Service { total: Effect<number>, add: (name) => Effect<void> }
capabilities.ts  Board { players, next, total } Provides Scores, Invokes players: Actor.many(Scorer)
                 Scorer { name, scored } Requires Scores; Score asks for the Command 'report'
```

## What to click

- A Scorer's Circle: `Score`. Its Update bumps `scored` and asks for the
  Command `report`, which calls `scores.add(name)`. That Request sends
  `Scored { name }` to the Board, whose Update bumps `total`.
- Chips on the Board: `Add player` (keyed Child `P-n`, at most 6) and
  `Remove last` (stops that Scorer; a Score for it afterwards is dropped).

## What to watch

- Strip: a view Marble on the Scorer's lane, then a command Marble on the
  Board's lane. That second entry's Source is `command Board/players[P-n]#1
report`, which the Picture draws as a Climb up the Band.
- Inspector: the Board's Change on `Scored` is `total` taking a new value;
  the Scorer's Change on `Score` is `scored`.
- Time Travel: Replay runs the same Updates with no Capability, so the
  totals match the live app exactly.
