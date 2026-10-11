# Snake

Status: works. It ticks: snake is a game of discrete steps.

## What was ported

Foldkit's `snake`: a 20×20 wrapping grid, arrows or WASD to turn, an apple at
a random free cell, 10 points per apple, the game speeding up with the score,
a high score kept across rounds.

```
Arcade (root)                  Model { highScore }; Provides Scores
└─ round: Round                Model { snake, apple, direction, nextDirection, points }
                               Requires Scores
     NotStarted                PressedStart → Playing
     Playing                   Worker `tick`: sleep interval(points), Ticked, forever
                               Ticked → step (+ apple Command if eaten)
                               PressedPause → Paused (the Worker stops)
     Paused                    PressedPause → Playing (the Worker starts again)
     GameOver                  entered with a Command: Scores.finished(points) (a Request)
     any                       PressedRestart → NotStarted, fresh snake, apple Command
round/body.ts    the snake as data: move, grow, bite itself, wrap
round/board.tsx  the grid; round/keys.ts the keys as Messages
```

## Deviations

- **A fixed tick, as a Worker of the Playing State.** The snake moves a whole
  cell per step, eats on a step and dies on a step, so there is no motion
  between Messages to draw at a Frame: the tick is the game. The `tick`
  Worker loops: read the points, `Effect.sleep(interval)` on Effect's Clock,
  shorter as the score grows (150 ms down to 80), send `Ticked`. Pausing
  leaves Playing, which stops it; resuming starts it again. Foldkit uses a
  Subscription that restarts when the interval changes; the Worker reads the
  interval live instead.
- **Enter starts, P pauses**, not Space: the Shell uses Space for
  Live/Replay. Buttons do the same for touch.
- The high score is kept by a parent `Arcade` Actor that outlives the rounds,
  told through the `Scores` Request. Foldkit keeps it in the one Model.
- Keys are a View hook (`useKeys`), as in Road, not a Subscription. Keys are
  sent as typed Messages (`Turned { direction }`), not `PressedKey { key }`.
- Foldkit retries the apple with `Effect.retry(Schedule.forever)` on a
  collision; here a loop picks again. Same result.

## Blockers

- None left. A Worker does not restart when the Model changes, but it reads
  the Model live through `self.get`, which is all the speeding clock needs.

## Testing

Foldkit's stories press keys and check `nextDirection`, step `TickedClock`
and check the snake moved, grew and scored, and that eating asks for
`GenerateApplePosition`, resolved with a chosen position. Its scenes check the
prompts per state and the scores.

What Effect Oak would need:

- Named Commands (roll-up blocker 4): to check that eating asked for an
  apple, and to resolve it with a chosen cell. The tick is a Worker, checked
  by stepping the clock.
- A typed `Actor.step` (blocker 5). The domain (`round/body.ts`) is plain
  functions and could be tested today.
- Testing a Request: that GameOver calls `Scores.finished(points)`, with a
  fake Scores. `Runtime.start` with a stub Layer can do this today.

## Also surprising

- About 7 to 12 `Ticked` Messages a second fill the Log. Replay steps per
  tick, which is all the game has.
- The game-over path was not reached in the browser check (it needs a snake
  long enough to bite itself); it is covered by the types and the Update.
