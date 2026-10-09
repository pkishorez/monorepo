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
     NotStarted                PressedStart → Playing + tick
     Playing                   Ticked → step, + next tick (+ apple Command if eaten)
                               PressedPause → Paused (replaceCommands: no tick)
     Paused                    PressedPause → Playing + tick
     GameOver                  entered with a Command: Scores.finished(points) (a Request)
     any                       PressedRestart → NotStarted, fresh snake, apple Command
round/body.ts    the snake as data: move, grow, bite itself, wrap
round/board.tsx  the grid; round/keys.ts the keys as Messages
```

## Deviations

- **A fixed tick, as a chain of Commands.** The snake moves a whole cell per
  step, eats on a step and dies on a step, so there is no motion between
  Messages to draw at a Frame: the tick is the game. Each `Ticked` asks for the
  next one as `Effect.sleep(interval)` in the app's Time, shorter as the score
  grows (150 ms down to 80). Pausing replaces it with nothing; resuming asks
  again. Foldkit uses a Subscription that restarts when the interval changes;
  a Lifetime cannot do that (blocker below).
- **Enter starts, P pauses**, not Space: the Shell uses Space for
  Live/Replay. Buttons do the same for touch.
- The high score is kept by a parent `Arcade` Node that outlives the rounds,
  told through the `Scores` Request. Foldkit keeps it in the one Model.
- Keys are a View hook (`useKeys`), as in Road, not a Subscription. Keys are
  sent as typed Messages (`Turned { direction }`), not `PressedKey { key }`.
- Foldkit retries the apple with `Effect.retry(Schedule.forever)` on a
  collision; here a loop picks again. Same result.

## Blockers

- **A Lifetime cannot follow the Model.** It starts once, with the Model as it
  was on entering the State. Foldkit's Subscriptions restart when
  `modelToDependencies` changes, so its clock speeds up with the score. Here
  each tick is a Command planning the next one, which works but puts the
  clock into Update. An API could key a Lifetime on a projection:
  `lifetime: { Playing: { key: ({ model }) => interval(model.points), run: … } }`,
  restarted whenever the key changes.

## Testing

Foldkit's stories press keys and check `nextDirection`, step `TickedClock`
and check the snake moved, grew and scored, and that eating asks for
`GenerateApplePosition`, resolved with a chosen position. Its scenes check the
prompts per state and the scores.

What Effect Oak would need:

- Named Commands (roll-up blocker 4): to check that a step asked for the next
  tick with the right interval, and for an apple, and to resolve the apple
  with a chosen cell.
- A typed `Node.step` (blocker 5). The domain (`round/body.ts`) is plain
  functions and could be tested today.
- Testing a Request: that GameOver calls `Scores.finished(points)`, with a
  fake Scores. `Runtime.start` with a stub Layer can do this today.

## Also surprising

- About 7 to 12 `Ticked` Messages a second fill the Log. Scrubbing is exact
  per tick, which is all the game has.
- The game-over path was not reached in the browser check (it needs a snake
  long enough to bite itself); it is covered by the types and the Update.
