import { View } from '@kestack/kabuki/react';
import { Button } from '@kestack/web-platform/ui/components/button';
import {
  HeartIcon,
  PlayIcon,
  SkipBackIcon,
  SkipForwardIcon,
  SquareIcon,
} from 'lucide-react';
import { PlaylistLive, SongLive } from './playlist.ts';

/** Three bars that pulse while a song plays. */
function Bars() {
  return (
    <span aria-hidden className="flex h-3.5 w-3.5 items-end gap-px">
      {[0, 150, 300].map((delay) => (
        <span
          key={delay}
          className="w-1 animate-pulse rounded-sm bg-emerald-500"
          style={{
            height: `${60 + delay / 10}%`,
            animationDelay: `${delay}ms`,
          }}
        />
      ))}
    </span>
  );
}

const SongView = View.make(SongLive, ({ model, props, send, root }) => (
  <li
    {...root}
    aria-current={props.playing ? 'true' : undefined}
    className="flex items-center gap-3 py-2 pr-1 pl-3 transition-colors duration-150 aria-[current]:bg-muted/50"
  >
    <span className="grid w-3.5 place-items-center">
      {props.playing && <Bars />}
    </span>
    <span className="min-w-0 flex-1">
      <span
        className={`block truncate text-sm ${props.playing ? 'font-semibold' : 'font-medium'}`}
      >
        {model.title}
      </span>
      <span className="block truncate text-xs text-muted-foreground">
        {model.artist}
      </span>
    </span>
    <Button
      size="icon-sm"
      variant="ghost"
      aria-label={model.liked ? 'Unlike' : 'Like'}
      aria-pressed={model.liked}
      onClick={() => send({ _tag: 'Liked' })}
    >
      <HeartIcon className={model.liked ? 'fill-rose-500 text-rose-500' : ''} />
    </Button>
  </li>
));

const PlaylistView = View.make(
  PlaylistLive,
  ({ model, children, send, root }) => (
    <div
      {...root}
      className="w-full max-w-72 overflow-hidden rounded-xl border border-border bg-background"
    >
      <ul className="divide-y divide-border">
        {children.songs.map((song) => (
          <SongView key={song.key} instance={song} />
        ))}
      </ul>
      <div className="flex items-center justify-center gap-1 border-t border-border p-2">
        <Button
          size="icon"
          variant="ghost"
          aria-label="Previous"
          onClick={() => send({ _tag: 'Previous' })}
        >
          <SkipBackIcon />
        </Button>
        {model.playing === null ? (
          <Button
            size="icon"
            aria-label="Play"
            onClick={() => send({ _tag: 'Next' })}
          >
            <PlayIcon />
          </Button>
        ) : (
          <Button
            size="icon"
            aria-label="Stop"
            onClick={() => send({ _tag: 'Stopped' })}
          >
            <SquareIcon />
          </Button>
        )}
        <Button
          size="icon"
          variant="ghost"
          aria-label="Next"
          onClick={() => send({ _tag: 'Next' })}
        >
          <SkipForwardIcon />
        </Button>
      </div>
    </div>
  ),
);

export const PlaylistApp = View.app(PlaylistView, { name: 'docs:props' });
