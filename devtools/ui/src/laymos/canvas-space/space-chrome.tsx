import type { ReactNode, RefObject } from 'react';
import {
  AnimatePresence,
  motion,
  useTransform,
  type MotionStyle,
} from 'motion/react';

import { Minus, Plus } from '@kstackz/web-platform/components/lucide';
import { cn } from '@kstackz/web-platform/components/utils';

import { ResizeHandle, usePreference } from '../preferences';
import { zoneAttribute } from './pointer-source';
import type { Space } from './use-space';

/**
 * The screen the space is seen through: the dotted ground that pans and
 * zooms, and the world the cards are drawn in. Children are drawn in world
 * coordinates; `overlay` sits still over the screen.
 */
export function SpaceViewport({
  space,
  inert = false,
  label,
  role = 'tree',
  overlay,
  onGroundClick,
  onGroundContextMenu,
  children,
}: {
  readonly space: Space;
  readonly inert?: boolean;
  readonly label: string;
  readonly role?: string;
  readonly overlay?: ReactNode;
  /** A click on the empty ground, not on a card or anything over it. */
  readonly onGroundClick?: (() => void) | undefined;
  /** A right-click on the empty ground. */
  readonly onGroundContextMenu?: (() => void) | undefined;
  readonly children: ReactNode;
}) {
  // Below full zoom, the focus outline grows so it stays as thick on screen.
  const unzoom = useTransform(space.zoom, (zoom) => Math.max(1, 1 / zoom));
  return (
    <div
      ref={space.viewportRef}
      inert={inert}
      // The space's keys reach its Actions before anything else on the
      // page can take them; it holds no text entry.
      data-keys="enabled"
      {...{ [zoneAttribute]: 'surface' }}
      role={role}
      aria-label={label}
      onClick={
        onGroundClick === undefined
          ? undefined
          : (event) => {
              if (event.target === event.currentTarget) onGroundClick();
            }
      }
      onContextMenu={
        onGroundContextMenu === undefined
          ? undefined
          : (event) => {
              if (event.target !== event.currentTarget) return;
              event.preventDefault();
              onGroundContextMenu();
            }
      }
      className="relative min-w-0 flex-1 cursor-grab touch-none select-none overflow-clip overscroll-none active:cursor-grabbing"
      style={{
        backgroundImage:
          'radial-gradient(circle at 1px 1px, color-mix(in oklab, var(--border) 90%, transparent) 1px, transparent 0)',
        backgroundSize: '22px 22px',
      }}
    >
      <motion.div
        className="absolute left-0 top-0 h-0 w-0"
        style={{
          x: space.x,
          y: space.y,
          scale: space.zoom,
          originX: 0,
          originY: 0,
          ...({ '--unzoom': unzoom } as MotionStyle),
        }}
      >
        {children}
      </motion.div>
      {overlay}
    </div>
  );
}

export function ZoomControls({ space }: { readonly space: Space }) {
  const zoomLabel = useTransform(
    space.zoom,
    (zoom) => `${Math.round(zoom * 100)}%`,
  );
  return (
    <div className="flex h-8 items-center rounded-md bg-background/90 shadow-xs ring-1 ring-border backdrop-blur-sm">
      <button
        type="button"
        aria-label="Zoom out"
        onClick={() => space.zoomBy(1 / 1.25)}
        className="flex h-full w-8 items-center justify-center rounded-l-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
      >
        <Minus className="size-3.5" />
      </button>
      <motion.span className="w-11 text-center font-mono text-[11px] tabular-nums text-muted-foreground">
        {zoomLabel}
      </motion.span>
      <button
        type="button"
        aria-label="Zoom in"
        onClick={() => space.zoomBy(1.25)}
        className="flex h-full w-8 items-center justify-center rounded-r-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
      >
        <Plus className="size-3.5" />
      </button>
    </div>
  );
}

/** The one-line hint under the space: how to move, then the keys. */
export function HintLine({
  hints,
  moves = ['Drag or scroll to move', 'pinch or ⌘ scroll to zoom'],
  className = 'absolute bottom-3 left-3 z-10',
}: {
  readonly hints: readonly string[];
  /** How to move about the space, said first. */
  readonly moves?: readonly string[];
  /** Where it sits; by default the bottom left of the screen. */
  readonly className?: string;
}) {
  return (
    <p
      className={cn(
        'pointer-events-none max-sm:hidden rounded-md bg-background/85 px-2 py-1 text-[11px] text-muted-foreground backdrop-blur-sm',
        className,
      )}
    >
      {[...moves, ...hints].join(' · ')}
    </p>
  );
}

/**
 * A wide panel over the blurred, dimmed space. Clicking the blur closes it;
 * the panel takes focus when it opens so its keys reach it. Given a
 * `widthKey`, its left edge drags it wider or narrower on a desktop, and
 * the width it is left at is kept under that key.
 */
export function SidePanel({
  open,
  label,
  panelRef,
  reducedMotion,
  widthKey,
  onClose,
  children,
}: {
  readonly open: boolean;
  readonly label: string;
  readonly panelRef: RefObject<HTMLElement | null>;
  readonly reducedMotion: boolean;
  readonly widthKey?: string | undefined;
  readonly onClose: () => void;
  readonly children: ReactNode;
}) {
  // 0 until dragged: the panel's own width.
  const [width, setWidth] = usePreference(widthKey ?? 'side-panel.width', 0);
  const resizable = widthKey !== undefined;
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="backdrop"
          aria-hidden
          onClick={onClose}
          className="absolute inset-0 z-20 bg-background/45 backdrop-blur-[3px]"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{
            opacity: 0,
            transition: { duration: reducedMotion ? 0 : 0.18, ease: 'easeIn' },
          }}
          transition={{ duration: 0.26, ease: [0.23, 1, 0.32, 1] }}
        />
      )}
      {open && (
        <motion.aside
          ref={panelRef}
          key="panel"
          tabIndex={-1}
          aria-label={label}
          style={
            resizable && width > 0
              ? { width: `min(${width}px, calc(100% - 48px))` }
              : undefined
          }
          className={cn(
            'absolute inset-y-0 right-0 z-30 flex w-[min(1120px,calc(100%-112px))] border-l border-border bg-background outline-none shadow-[-24px_0_48px_-24px_rgb(0_0_0/0.18)]',
            // A phone gives the panel the whole screen, over everything.
            'max-sm:fixed max-sm:inset-0 max-sm:z-50 max-sm:w-full! max-sm:max-w-none max-sm:border-l-0',
          )}
          initial={reducedMotion ? { opacity: 0 } : { x: 40, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          exit={
            reducedMotion
              ? { opacity: 0, transition: { duration: 0 } }
              : {
                  x: 40,
                  opacity: 0,
                  transition: { duration: 0.18, ease: 'easeIn' },
                }
          }
          transition={{ duration: 0.26, ease: [0.23, 1, 0.32, 1] }}
        >
          {resizable && (
            <ResizeHandle
              label="Resize the panel"
              className="-left-0.75"
              onMove={(x) => {
                const frame =
                  panelRef.current?.parentElement?.getBoundingClientRect();
                if (frame === undefined) return;
                setWidth(
                  Math.round(
                    Math.min(frame.width - 48, Math.max(420, frame.right - x)),
                  ),
                );
              }}
            />
          )}
          {children}
        </motion.aside>
      )}
    </AnimatePresence>
  );
}
