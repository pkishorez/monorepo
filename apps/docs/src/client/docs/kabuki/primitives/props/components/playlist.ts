import { Schema } from 'effect';
import { Actor } from '@kestack/kabuki';
import { SONGS } from './songs.ts';

export const Song = Actor.define('Song', {
  input: Schema.Struct({ title: Schema.String, artist: Schema.String }),
  // What the Playlist says now. The Song reads it, and never writes it.
  props: Schema.Struct({ playing: Schema.Boolean }),
  model: Schema.Struct({
    title: Schema.String,
    artist: Schema.String,
    liked: Schema.Boolean,
  }),
  message: Schema.TaggedUnion({ Liked: {} }),
});

export const SongLive = Actor.build(Song, {
  init: (song) => ({ model: { ...song, liked: false } }),
  on: {
    Liked: (_, { model }) => ({ model: { ...model, liked: !model.liked } }),
  },
});

export const Playlist = Actor.define('Playlist', {
  model: Schema.Struct({
    ids: Schema.Array(Schema.String),
    playing: Schema.NullOr(Schema.String),
  }),
  message: Schema.TaggedUnion({ Next: {}, Previous: {}, Stopped: {} }),
});

/** The id `by` places away from the one playing, wrapping around. */
const move = (
  ids: ReadonlyArray<string>,
  playing: string | null,
  by: number,
) => {
  const at = playing === null ? (by > 0 ? -1 : 0) : ids.indexOf(playing);
  return ids[(at + by + ids.length) % ids.length]!;
};

export const PlaylistLive = Actor.build(Playlist, {
  init: () => ({ model: { ids: ['0', '1', '2', '3'], playing: null } }),
  children: {
    songs: {
      actor: SongLive,
      each: ({ model }) => model.ids,
      input: (_, id) => SONGS[id]!,
      // Worked out again after every Update of the Playlist.
      props: ({ model }, id) => ({ playing: model.playing === id }),
    },
  },
  on: {
    Next: (_, { model }) => ({
      model: { ...model, playing: move(model.ids, model.playing, 1) },
    }),
    Previous: (_, { model }) => ({
      model: { ...model, playing: move(model.ids, model.playing, -1) },
    }),
    Stopped: (_, { model }) => ({ model: { ...model, playing: null } }),
  },
});
