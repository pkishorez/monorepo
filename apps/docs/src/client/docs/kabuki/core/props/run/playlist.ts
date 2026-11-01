import { Console, Effect } from 'effect';
import { Runtime } from '@kestack/kabuki';
import { PlaylistLive } from '../components/playlist.ts';

// The Playlist decides what plays. Each Song reads it from its Props.
export const program = Effect.gen(function* () {
  const app = yield* Runtime.start(PlaylistLive);
  const playlist = app.instance({ from: 'docs' });
  // What the Playlist holds, and the Prop each Song is handed.
  const both = () => [
    { playing: playlist.model.playing },
    playlist.children.songs.map((song) => song.props.playing),
  ];
  yield* Console.log('starts', ...both());

  // Only the Playlist's Model changes. Each Song's Prop follows.
  playlist.send({ _tag: 'Next' });
  yield* Console.log('Next:', ...both());
  playlist.send({ _tag: 'Next' });
  yield* Console.log('Next:', ...both());

  // Liked is the Song's own data. Props never touch it.
  const [first] = playlist.children.songs;
  first.send({ _tag: 'Liked' });
  playlist.send({ _tag: 'Stopped' });
  yield* Console.log('Stopped:', ...both());

  return { props: first.props, liked: first.model.liked };
});
