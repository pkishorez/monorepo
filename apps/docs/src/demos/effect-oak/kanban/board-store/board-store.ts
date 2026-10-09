import { Context, Effect, Layer, Schema } from 'effect';
import { Columns, defaultColumns } from '../columns/index.js';

/** Where the board is kept between visits. */
export class BoardStore extends Context.Service<
  BoardStore,
  {
    readonly load: Effect.Effect<Columns>;
    readonly save: (columns: Columns) => Effect.Effect<void, string>;
  }
>()('docs/kanban/BoardStore') {}

const KEY = 'effect-oak/kanban-board';
const Json = Schema.fromJsonString(Schema.toCodecJson(Columns));

/** The browser's localStorage. Nothing saved, or nothing readable, is the default board. */
export const BoardStoreLive = Layer.succeed(BoardStore, {
  load: Effect.suspend(() => {
    const saved = localStorage.getItem(KEY);
    return saved === null
      ? Effect.succeed(defaultColumns())
      : Schema.decodeEffect(Json)(saved).pipe(
          Effect.orElseSucceed(defaultColumns),
        );
  }),
  save: (columns) =>
    Schema.encodeEffect(Json)(columns).pipe(
      Effect.mapError(String),
      Effect.flatMap((json) =>
        Effect.try({
          try: () => localStorage.setItem(KEY, json),
          catch: String,
        }),
      ),
    ),
});
