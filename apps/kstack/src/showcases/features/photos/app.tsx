import { Button } from '@kstackz/ui-toolkit/components/ui/button';
import { PanelLeftIcon } from '@kstackz/ui-toolkit/lucide';
import { GestureZone } from '@kstackz/use-gesture';
import { useCallback, useRef, useState } from 'react';
import { appTheme } from '../../../common/theme.ts';
import { Albums } from './albums.tsx';
import { ALBUMS } from './data.ts';
import { type Flight, Grid } from './grid.tsx';
import { Viewer } from './viewer.tsx';

// Plain sRGB per theme, like the Theme's own strip.
const STATUS_BAR = {
  albums: 'light-dark(#fafafa, #151515)', // --sidebar
  viewer: '#000000',
};

/**
 * A photo library: a grid you pinch between 3 and 5 columns, a viewer that
 * grows from a tile, and albums in a sidebar that opens from anywhere on the
 * grid, never from inside the viewer.
 */
export function App() {
  return (
    <GestureZone className="fixed inset-0 overflow-hidden bg-background text-foreground">
      <Library />
    </GestureZone>
  );
}

function Library() {
  const [slug, setSlug] = useState(ALBUMS[0]?.slug ?? '');
  const album = ALBUMS.find((a) => a.slug === slug) ?? ALBUMS[0];
  const photos = album?.photos ?? [];
  const [albumsOpen, setAlbumsOpen] = useState(false);
  const [viewer, setViewer] = useState<{ start: number } | undefined>();
  const [showing, setShowing] = useState<string | undefined>();
  const [flight, setFlight] = useState<Flight | undefined>();
  const tiles = useRef(new Map<string, HTMLElement>());

  const onOpen = useCallback(
    (index: number) => {
      setViewer({ start: index });
      setShowing(photos[index]?.id);
    },
    [photos],
  );

  return (
    <>
      <appTheme.StatusBar
        color={
          viewer !== undefined
            ? STATUS_BAR.viewer
            : albumsOpen
              ? STATUS_BAR.albums
              : undefined
        }
      />
      <Grid
        photos={photos}
        hidden={showing}
        tiles={tiles.current}
        onOpen={onOpen}
        flight={flight}
        onLanded={() => setFlight(undefined)}
      />
      <header className="absolute inset-x-0 top-0 z-10 bg-background/80 pt-[env(safe-area-inset-top)] pr-[env(safe-area-inset-right)] pl-[env(safe-area-inset-left)] backdrop-blur-md">
        <div className="flex h-14 items-center gap-1 px-2">
          <Button
            variant="ghost"
            size="icon"
            aria-label="Albums"
            className="size-11 md:size-9"
            onClick={() => setAlbumsOpen(true)}
          >
            <PanelLeftIcon aria-hidden="true" />
          </Button>
          <h1 className="flex-1 text-[15px] font-semibold tracking-tight">
            {album?.title}
          </h1>
          <span className="px-3 text-xs text-muted-foreground tabular-nums">
            {photos.length}
          </span>
        </div>
      </header>
      <Albums
        albums={ALBUMS}
        current={slug}
        open={albumsOpen}
        onOpenChange={setAlbumsOpen}
        onPick={setSlug}
        enabled={viewer === undefined}
      />
      {viewer === undefined ? null : (
        <Viewer
          photos={photos}
          start={viewer.start}
          rectOf={(id) => tiles.current.get(id)?.getBoundingClientRect()}
          onHandOff={(next) => {
            if (!tiles.current.has(next.photo.id)) return false;
            setFlight(next);
            return true;
          }}
          onIndexChange={(index) => {
            const id = photos[index]?.id;
            setShowing(id);
            // Behind the viewer, the grid keeps the photo in view to close onto.
            if (id !== undefined) {
              tiles.current.get(id)?.scrollIntoView({ block: 'nearest' });
            }
          }}
          onClosed={() => {
            setViewer(undefined);
            setShowing(undefined);
          }}
        />
      )}
    </>
  );
}
