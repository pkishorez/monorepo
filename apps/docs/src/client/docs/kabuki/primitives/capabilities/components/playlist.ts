import { Effect, Layer, Schema } from 'effect';
import { Actor, Command } from '@kestack/kabuki';
import { Player } from './player.ts';
import { SONGS } from './songs.ts';

// An errand: ask whoever provides the Player to play this song.
const play = Command.make('play', {
  args: Schema.Struct({ id: Schema.String }),
  run: ({ id }) =>
    Effect.gen(function* () {
      const player = yield* Player;
      yield* player.play(id);
    }),
});

export const Song = Actor.define('Song', {
  // The Song needs a Player. It doesn't know, or care, who gives it.
  requires: [Player],
  input: Schema.Struct({
    id: Schema.String,
    title: Schema.String,
    artist: Schema.String,
  }),
  props: Schema.Struct({ playing: Schema.Boolean }),
  model: Schema.Struct({
    id: Schema.String,
    title: Schema.String,
    artist: Schema.String,
    liked: Schema.Boolean,
  }),
  message: Schema.TaggedUnion({ Liked: {}, Pressed: {} }),
});

export const SongLive = Actor.build(Song, {
  init: (song) => ({ model: { ...song, liked: false } }),
  on: {
    Liked: (_, { model }) => ({ model: { ...model, liked: !model.liked } }),
    Pressed: (_, { model }) => ({ command: play({ id: model.id }) }),
  },
});

export const Playlist = Actor.define('Playlist', {
  model: Schema.Struct({
    ids: Schema.Array(Schema.String),
    playing: Schema.NullOr(Schema.String),
  }),
  message: Schema.TaggedUnion({
    Played: { id: Schema.String },
    Stopped: {},
  }),
});

export const PlaylistLive = Actor.build(Playlist, {
  init: () => ({ model: { ids: ['0', '1', '2', '3'], playing: null } }),
  // Everything below can ask for a song. Each ask is a Message to here.
  provides: (self) =>
    Layer.succeed(Player, {
      play: (id) => self.send({ _tag: 'Played', id }),
    }),
  children: (child) => ({
    songs: child(SongLive, {
      each: ({ model }) => model.ids,
      input: (_, id) => ({ id, ...SONGS[id]! }),
      props: ({ model }, id) => ({ playing: model.playing === id }),
    }),
  }),
  on: {
    Played: ({ id }, { model }) => ({ model: { ...model, playing: id } }),
    Stopped: (_, { model }) => ({ model: { ...model, playing: null } }),
  },
});
