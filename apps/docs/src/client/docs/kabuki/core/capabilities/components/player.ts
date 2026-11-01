import { Context } from 'effect';
import type { Effect } from 'effect';

// What the Playlist offers everything below it: a way to ask for a song.
export class Player extends Context.Service<
  Player,
  { readonly play: (id: string) => Effect.Effect<void> }
>()('docs/Player') {}
