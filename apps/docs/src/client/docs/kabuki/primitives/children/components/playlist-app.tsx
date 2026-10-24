import { Layer } from 'effect';
import { View, toReact } from '@kestack/kabuki/react';
import { Button } from '@kestack/web-platform/ui/components/button';
import { HeartIcon, XIcon } from '@kestack/web-platform/ui/components/lucide';
import { PlaylistLive, SongLive } from './playlist.ts';
import { SONGS } from './songs.ts';

const SongView = View.make(SongLive, ({ model, send, root }) => (
  <div {...root} className="flex min-w-0 flex-1 items-center gap-3">
    <span className="min-w-0 flex-1">
      <span className="block truncate text-sm font-medium">{model.title}</span>
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
  </div>
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
          <li key={song.key} className="flex items-center gap-1 py-2 pr-1 pl-3">
            <SongView instance={song} />
            <Button
              size="icon-sm"
              variant="ghost"
              aria-label="Remove"
              className="text-muted-foreground"
              onClick={() => send({ _tag: 'Removed', id: song.key })}
            >
              <XIcon />
            </Button>
          </li>
        ))}
        {children.songs.length === 0 && (
          <li className="px-3 py-6 text-center text-sm text-muted-foreground">
            No songs yet. Add one below.
          </li>
        )}
      </ul>
      <div className="border-t border-border p-2">
        <Button
          variant="ghost"
          className="w-full"
          disabled={model.ids.length === Object.keys(SONGS).length}
          onClick={() => send({ _tag: 'Added' })}
        >
          Add a song
        </Button>
      </div>
    </div>
  ),
);

export const PlaylistApp = toReact(PlaylistLive, PlaylistView, Layer.empty, {
  name: 'docs:children',
});
