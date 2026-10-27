import { useEffect, useRef, useState } from 'react';
import { useFrame } from './frame.tsx';

const MIN = 224;
const MAX = 480;
const STEP = 16;

const clamp = (width: number) => Math.min(MAX, Math.max(MIN, width));

// While dragging, the whole page keeps the resize cursor and no text selects.
const holdCursor = (held: boolean) => {
  document.body.style.cursor = held ? 'col-resize' : '';
  document.body.style.userSelect = held ? 'none' : '';
};

/**
 * The sidebar's right edge on a wide screen, over the sidebar and the page
 * both and centred on the line between them, so the pointer finds it from
 * either side: drag it, or use the arrow keys, to resize the sidebar
 * between 224 and 480 px; click it, or press Enter, to shut or open it.
 */
export function ResizeHandle(props: {
  readonly width: number;
  readonly onWidthChange: (width: number) => void;
}) {
  const { open, toggle } = useFrame();
  const drag = useRef<{ x: number; width: number } | null>(null);
  const moved = useRef(false);
  const [resizing, setResizing] = useState(false);

  const stop = () => {
    drag.current = null;
    setResizing(false);
    holdCursor(false);
  };
  // Gone mid-drag, as when the sidebar is shut while dragging, the page
  // gets its cursor and selection back.
  useEffect(
    () => () => {
      if (drag.current !== null) holdCursor(false);
    },
    [],
  );

  return (
    <button
      type="button"
      role="separator"
      aria-label="Resize the sidebar"
      aria-orientation="vertical"
      aria-valuemin={MIN}
      aria-valuemax={MAX}
      aria-valuenow={props.width}
      aria-valuetext={`${props.width} pixels wide`}
      data-resizing={resizing}
      style={{ left: 'var(--sidebar-width)' }}
      className="absolute inset-y-0 z-20 hidden w-3 -translate-x-1/2 cursor-col-resize touch-none after:absolute after:inset-y-0 after:left-1/2 after:w-0.5 after:-translate-x-1/2 after:transition-[background-color] after:duration-150 hover:after:bg-primary/40 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring data-[resizing=true]:after:bg-primary/60 md:block"
      onPointerDown={(event) => {
        if (!open || event.button !== 0) return;
        event.currentTarget.setPointerCapture(event.pointerId);
        drag.current = { x: event.clientX, width: props.width };
        moved.current = false;
      }}
      onPointerMove={(event) => {
        if (drag.current === null) return;
        const delta = event.clientX - drag.current.x;
        if (!moved.current && Math.abs(delta) > 2) {
          moved.current = true;
          setResizing(true);
          holdCursor(true);
        }
        if (moved.current)
          props.onWidthChange(clamp(drag.current.width + delta));
      }}
      onPointerUp={(event) => {
        if (drag.current === null) return;
        event.currentTarget.releasePointerCapture(event.pointerId);
        stop();
      }}
      onPointerCancel={() => {
        moved.current = false;
        stop();
      }}
      // The pointer taken away some other way ends the drag too.
      onLostPointerCapture={() => {
        if (drag.current !== null) stop();
      }}
      onClick={() => {
        if (moved.current) {
          moved.current = false;
          return;
        }
        toggle();
      }}
      onKeyDown={(event) => {
        if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
          event.preventDefault();
          const direction = event.key === 'ArrowLeft' ? -1 : 1;
          props.onWidthChange(clamp(props.width + direction * STEP));
        } else if (event.key === 'Home' || event.key === 'End') {
          event.preventDefault();
          props.onWidthChange(event.key === 'Home' ? MIN : MAX);
        }
      }}
    />
  );
}
