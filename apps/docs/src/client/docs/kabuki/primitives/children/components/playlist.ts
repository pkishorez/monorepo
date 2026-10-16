import { Schema } from 'effect';
import { Actor } from '@kestack/kabuki';
import { SONGS } from './songs.ts';

// A Song: a small Actor of its own, with its own data.
export const Song = Actor.define('Song', {
  input: Schema.Struct({ title: Schema.String, artist: Schema.String }),
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

// The Playlist keeps only which songs are in it. Each one is a Child.
export const Playlist = Actor.define('Playlist', {
  model: Schema.Struct({ ids: Schema.Array(Schema.String) }),
  message: Schema.TaggedUnion({
    Added: {},
    Removed: { id: Schema.String },
  }),
});

export const PlaylistLive = Actor.build(Playlist, {
  init: () => ({ model: { ids: ['0', '1'] } }),
  children: {
    songs: {
      actor: SongLive,
      each: ({ model }) => model.ids,
      input: (_, id) => SONGS[id]!,
    },
  },
  on: {
    Added: (_, { model }) => {
      const next = Object.keys(SONGS).find((id) => !model.ids.includes(id));
      return next ? { model: { ids: [...model.ids, next] } } : {};
    },
    Removed: ({ id }, { model }) => ({
      model: { ids: model.ids.filter((kept) => kept !== id) },
    }),
  },
});
