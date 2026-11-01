import { Deferred, Effect, Layer } from 'effect';
import { Actor, Runtime } from '@kestack/kabuki';
import { Player } from '../components/player.ts';
import { SongLive } from '../components/playlist.ts';
import { SONGS } from '../components/songs.ts';

// A Shelf holds one Song and Provides nothing. The Song still Requires a
// Player, so that need climbs to the root, and the app's Layer covers it.
const ShelfLive = Actor.define('Shelf', {}).build({
  children: {
    song: Actor.child(SongLive, {
      input: () => ({ id: '4', ...SONGS['4']! }),
      props: () => ({ playing: false }),
    }),
  },
});

export const program = Effect.gen(function* () {
  const asked = yield* Deferred.make<string>();
  // The Player from outside the tree. Leave it out, and this doesn't compile.
  const PlayerLive = Layer.succeed(Player, {
    play: (id) => Deferred.succeed(asked, id).pipe(Effect.asVoid),
  });

  const app = yield* Runtime.start(ShelfLive, PlayerLive);
  app.instance({ from: 'docs' }).children.song.send({ _tag: 'Pressed' });

  // The Song's Command called the Layer's Player.
  return { played: yield* Deferred.await(asked) };
});
