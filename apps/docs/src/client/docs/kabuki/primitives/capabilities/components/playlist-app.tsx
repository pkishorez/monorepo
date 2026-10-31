import { Layer } from 'effect';
import { View } from '@kestack/kabuki/react';
import { Button } from '@kestack/web-platform/ui/components/button';
import { HeartIcon, SquareIcon } from 'lucide-react';
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
    className="flex items-center gap-1 pr-1 transition-colors duration-150 aria-[current]:bg-muted/50"
  >
    <button
      type="button"
      onClick={() => send({ _tag: 'Pressed' })}
      className="flex min-w-0 flex-1 items-center gap-3 py-2 pl-3 text-left focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-foreground"
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
    </button>
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
      <div className="flex h-12 items-center justify-between gap-2 border-t border-border pr-2 pl-3">
        <span className="text-xs text-muted-foreground">
          {model.playing === null ? 'Tap a song to play it' : 'Playing'}
        </span>
        {model.playing !== null && (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => send({ _tag: 'Stopped' })}
          >
            <SquareIcon />
            Stop
          </Button>
        )}
      </div>
    </div>
  ),
);

export const PlaylistApp = View.app(PlaylistView, {
  name: 'docs:capabilities',
});
