import { Console, Effect } from 'effect';
import { Runtime } from '@kestack/kabuki';
import { PlaylistLive } from '../components/playlist.ts';

// Press a Song. It asks the Player for itself, and the Playlist answers.
export const program = Effect.gen(function* () {
  const app = yield* Runtime.start(PlaylistLive);
  const playlist = app.instance({ from: 'docs' });
  yield* Console.log('starts', playlist.model);

  // Pressed asks for the play Command, which calls the Player.
  const [, , peace] = playlist.children.songs;
  yield* Console.log('Pressed:', peace.send({ _tag: 'Pressed' }));

  // The Command runs after the Update. Wait for its Message to land.
  yield* playlist.until((now) => now.model.playing !== null);
  yield* Console.log('Played:', playlist.model);

  // The answer came back down as Props.
  return playlist.children.songs.map((song) => song.props.playing);
});
