import { cn } from '@kstackz/ui-toolkit/utils';
import { useSidebar } from '@kstackz/use-gesture';
import { motion } from 'motion/react';
import type { Album } from './data.ts';
import { PhotoArt } from './photo.tsx';

const WIDTH = 288;

/**
 * The albums, in a sidebar that opens from a Swipe right anywhere on the
 * library. `enabled` is off while the viewer is open.
 */
export function Albums(props: {
  readonly albums: ReadonlyArray<Album>;
  readonly current: string;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly onPick: (slug: string) => void;
  readonly enabled: boolean;
}) {
  const sidebar = useSidebar({
    side: 'left',
    width: WIDTH,
    open: props.open,
    onOpenChange: props.onOpenChange,
    enabled: props.enabled,
  });

  return (
    <>
      <motion.div
        className="absolute inset-0 z-30 bg-black/40"
        style={{
          opacity: sidebar.progress,
          pointerEvents: sidebar.open ? 'auto' : 'none',
        }}
        onClick={() => sidebar.setOpen(false)}
      />
      <motion.nav
        aria-label="Albums"
        inert={!sidebar.open}
        className="absolute inset-y-0 left-0 z-30 flex flex-col overflow-y-auto bg-sidebar pt-[env(safe-area-inset-top)] pb-[calc(env(safe-area-inset-bottom)+5.5rem)] pl-[env(safe-area-inset-left)] text-sidebar-foreground shadow-xl"
        style={{ width: WIDTH, x: sidebar.x }}
      >
        <h2 className="flex h-14 shrink-0 items-center px-4 text-[15px] font-semibold tracking-tight">
          Albums
        </h2>
        <ul className="flex flex-col gap-0.5 px-2">
          {props.albums.map((album) => {
            const cover = album.photos[0];
            const here = album.slug === props.current;
            return (
              <li key={album.slug}>
                <button
                  type="button"
                  aria-current={here ? 'page' : undefined}
                  className={cn(
                    'flex w-full items-center gap-3 rounded-lg p-2 text-left text-sm transition-colors duration-150 hover:bg-sidebar-accent focus-visible:outline-2 focus-visible:outline-ring',
                    here && 'bg-sidebar-accent font-medium',
                  )}
                  onClick={() => {
                    props.onPick(album.slug);
                    sidebar.setOpen(false);
                  }}
                >
                  <span className="size-11 shrink-0 overflow-hidden rounded-md bg-muted">
                    {cover === undefined ? null : <PhotoArt photo={cover} />}
                  </span>
                  <span className="flex-1 truncate">{album.title}</span>
                  <span className="text-xs text-muted-foreground tabular-nums">
                    {album.photos.length}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </motion.nav>
    </>
  );
}
