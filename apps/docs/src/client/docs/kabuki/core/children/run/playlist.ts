import { Console, Effect } from 'effect';
import { Runtime } from '@kestack/kabuki';
import { PlaylistLive } from '../components/playlist.ts';

// The Playlist's ids decide its Songs. Watch them come and go.
export const program = Effect.gen(function* () {
  const app = yield* Runtime.start(PlaylistLive);
  const playlist = app.instance({ from: 'docs' });
  const songs = () => playlist.children.songs;
  const titles = () => songs().map((song) => song.model.title);
  yield* Console.log('ids', playlist.model.ids, titles());

  // A new id starts a new Song.
  playlist.send({ _tag: 'Added' });
  yield* Console.log('Added:', playlist.model.ids, titles());

  // Each Song is an Actor of its own. Like the second one.
  const [first, second] = songs();
  second.send({ _tag: 'Liked' });

  // The first asks to go. It Emits Remove, and the Playlist hears Removed.
  first.send({ _tag: 'Removing' });
  yield* Console.log('Removing:', playlist.model.ids, titles());
  yield* Console.log('the removed Song stopped:', first.stopped);

  // The liked Song is the same Instance, still liked.
  return second.model;
});
