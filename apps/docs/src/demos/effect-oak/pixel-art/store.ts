import { Context, Effect, Layer, Schema } from 'effect';
import { Grid } from './grid.js';

/** What is kept between visits: the picture, its size, the palette and color. */
export const Saved = Schema.Struct({
  grid: Grid,
  size: Schema.Number,
  theme: Schema.Number,
  color: Schema.Number,
});
export type Saved = typeof Saved.Type;

/** Where the picture is kept between visits. */
export class PictureStore extends Context.Service<
  PictureStore,
  {
    readonly load: Effect.Effect<Saved | null>;
    readonly save: (saved: Saved) => Effect.Effect<void, Error>;
  }
>()('docs/pixel-art/PictureStore') {}

const KEY = 'effect-oak/pixel-art';
const Json = Schema.fromJsonString(Schema.toCodecJson(Saved));

/** The browser's localStorage. Nothing saved, or nothing readable, is null. */
export const PictureStoreLive = Layer.succeed(PictureStore, {
  load: Effect.suspend(() => {
    const saved = localStorage.getItem(KEY);
    return saved === null
      ? Effect.succeed(null)
      : Schema.decodeEffect(Json)(saved).pipe(Effect.orElseSucceed(() => null));
  }),
  save: (saved) =>
    Schema.encodeEffect(Json)(saved).pipe(
      Effect.flatMap((json) =>
        Effect.try({
          try: () => localStorage.setItem(KEY, json),
          catch: (cause) => cause,
        }),
      ),
      Effect.mapError(
        (cause) => new Error('Could not save the picture', { cause }),
      ),
    ),
});
