import { useEffect, useRef, useState } from 'react';
import { SidebarRail, useSidebar } from 'kui-toolkit/components/ui/sidebar';

export const defaultSidebarWidth = 256;
export const minimumSidebarWidth = 224;
export const maximumSidebarWidth = 480;

const clamp = (width: number) =>
  Math.min(maximumSidebarWidth, Math.max(minimumSidebarWidth, width));

export function SidebarResizeHandle({
  value,
  onValueChange,
  onResizingChange,
}: {
  value: number;
  onValueChange: (value: number) => void;
  onResizingChange: (resizing: boolean) => void;
}) {
  const { open, toggleSidebar } = useSidebar();
  const drag = useRef<{ x: number; width: number } | null>(null);
  const moved = useRef(false);
  const [resizing, setResizing] = useState(false);

  // While dragging, the whole page keeps the resize cursor and text cannot be selected.
  useEffect(() => {
    onResizingChange(resizing);
    if (!resizing) return;
    const { cursor, userSelect } = document.body.style;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    return () => {
      document.body.style.cursor = cursor;
      document.body.style.userSelect = userSelect;
    };
  }, [resizing, onResizingChange]);

  const stop = () => {
    drag.current = null;
    setResizing(false);
  };

  return (
    <SidebarRail
      role="separator"
      aria-label="Resize navigation sidebar"
      aria-orientation="vertical"
      aria-valuemin={minimumSidebarWidth}
      aria-valuemax={maximumSidebarWidth}
      aria-valuenow={value}
      aria-valuetext={`${value} pixels wide`}
      tabIndex={0}
      title="Drag to resize the sidebar"
      className="touch-none !cursor-col-resize transition-none after:bg-transparent after:transition-[background-color] after:duration-150 hover:after:bg-primary/40 data-[resizing=true]:after:bg-primary/60 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ring"
      data-resizing={resizing}
      onPointerDown={(event) => {
        if (!open || event.button !== 0) return;
        event.currentTarget.setPointerCapture(event.pointerId);
        drag.current = { x: event.clientX, width: value };
        moved.current = false;
      }}
      onPointerMove={(event) => {
        if (!drag.current) return;
        const delta = event.clientX - drag.current.x;
        if (!moved.current && Math.abs(delta) > 2) {
          moved.current = true;
          setResizing(true);
        }
        if (moved.current) onValueChange(clamp(drag.current.width + delta));
      }}
      onPointerUp={(event) => {
        if (!drag.current) return;
        event.currentTarget.releasePointerCapture(event.pointerId);
        stop();
      }}
      onPointerCancel={() => {
        moved.current = false;
        stop();
      }}
      onClick={() => {
        if (moved.current) {
          moved.current = false;
          return;
        }
        toggleSidebar();
      }}
      onKeyDown={(event) => {
        if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
          event.preventDefault();
          const direction = event.key === 'ArrowLeft' ? -1 : 1;
          onValueChange(clamp(value + direction * 16));
          return;
        }
        if (event.key === 'Home' || event.key === 'End') {
          event.preventDefault();
          onValueChange(
            event.key === 'Home' ? minimumSidebarWidth : maximumSidebarWidth,
          );
          return;
        }
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          toggleSidebar();
        }
      }}
    />
  );
}
