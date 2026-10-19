import { Context } from 'effect';
import type { Effect } from 'effect';
import type { Cell } from '../rules.ts';

/** What the Stage Provides while Playing: the Game tells it how it went. */
export class Referee extends Context.Service<
  Referee,
  {
    readonly scored: Effect.Effect<void>;
    readonly crashed: (body: ReadonlyArray<Cell>) => Effect.Effect<void>;
  }
>()('Referee') {}
