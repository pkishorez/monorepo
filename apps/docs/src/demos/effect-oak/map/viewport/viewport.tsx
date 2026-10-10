import { useLayoutEffect, useReducer, useRef, useState } from 'react';
import { useMotionValueEvent } from 'motion/react';
import type { MotionValue } from 'motion/react';
import { MapPin, Minus, Plus, X } from 'lucide-react';
import { Button } from '@kstackz/web-platform/components/button';
import { LOCATIONS, project } from '../world/index.js';
import { Tiles } from './tiles.js';

/*
 * The map on screen: tiles, markers and a popup, drawn for the camera at the
 * Frame. The tiles change which images exist as the camera moves, so this
 * one renders: the camera is worked out during render from the Frame, and a
 * Frame that moves the camera (only during a flight) asks for a render. While
 * the camera is still, nothing re-renders.
 *
 * Dragging and the wheel are reported as Messages, a drag as one Message per
 * pointer move. The box's size and the pointer's last spot are DOM details
 * kept in refs, outside the Model.
 */

type Camera = {
  readonly lng: number;
  readonly lat: number;
  readonly zoom: number;
};

const WHEEL_STEP = 0.0025;

const same = (a: Camera, b: Camera) =>
  a.lng === b.lng && a.lat === b.lat && a.zoom === b.zoom;

export const Viewport = ({
  cameraAt,
  frame,
  selectedId,
  user,
  onPan,
  onZoom,
  onMarker,
  onDismiss,
}: {
  readonly cameraAt: (at: number) => Camera;
  readonly frame: MotionValue<number>;
  readonly selectedId: string | null;
  readonly user: { readonly lng: number; readonly lat: number } | null;
  readonly onPan: (dx: number, dy: number) => void;
  readonly onZoom: (by: number) => void;
  readonly onMarker: (locationId: string) => void;
  readonly onDismiss: () => void;
}) => {
  const box = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const camera = cameraAt(frame.get());
  const [, redraw] = useReducer((n: number) => n + 1, 0);
  useMotionValueEvent(frame, 'change', (at) => {
    const before = frame.getPrevious();
    if (before === undefined || !same(cameraAt(before), cameraAt(at))) redraw();
  });
  const pointer = useRef<{ x: number; y: number } | null>(null);
  const onZoomRef = useRef(onZoom);
  onZoomRef.current = onZoom;

  useLayoutEffect(() => {
    const element = box.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry)
        setSize({
          width: entry.contentRect.width,
          height: entry.contentRect.height,
        });
    });
    observer.observe(element);
    const wheel = (event: WheelEvent) => {
      event.preventDefault();
      onZoomRef.current(-event.deltaY * WHEEL_STEP);
    };
    element.addEventListener('wheel', wheel, { passive: false });
    return () => {
      observer.disconnect();
      element.removeEventListener('wheel', wheel);
    };
  }, []);

  const center = project(camera.lng, camera.lat, camera.zoom);
  const toScreen = (lng: number, lat: number) => {
    const p = project(lng, lat, camera.zoom);
    return {
      left: p.x - center.x + size.width / 2,
      top: p.y - center.y + size.height / 2,
    };
  };
  const selected = LOCATIONS.find((place) => place.id === selectedId);

  return (
    <div
      ref={box}
      className="relative size-full cursor-grab touch-none overflow-hidden bg-muted active:cursor-grabbing"
      onPointerDown={(event) => {
        if ((event.target as Element).closest('button')) return;
        event.currentTarget.setPointerCapture(event.pointerId);
        pointer.current = { x: event.clientX, y: event.clientY };
      }}
      onPointerMove={(event) => {
        const last = pointer.current;
        if (!last) return;
        pointer.current = { x: event.clientX, y: event.clientY };
        onPan(event.clientX - last.x, event.clientY - last.y);
      }}
      onPointerUp={() => (pointer.current = null)}
      onPointerCancel={() => (pointer.current = null)}
    >
      <Tiles camera={camera} width={size.width} height={size.height} />
      {LOCATIONS.map((place) => (
        <button
          key={place.id}
          type="button"
          aria-label={`Marker: ${place.name}`}
          className="absolute -translate-x-1/2 -translate-y-full"
          style={toScreen(place.lng, place.lat)}
          onClick={() => onMarker(place.id)}
        >
          <MapPin
            className={`size-7 drop-shadow ${place.id === selectedId ? 'fill-primary text-primary-foreground' : 'fill-background text-primary'}`}
          />
        </button>
      ))}
      {user && (
        <span
          aria-label="You are here"
          className="absolute size-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-background bg-blue-600 shadow"
          style={toScreen(user.lng, user.lat)}
        />
      )}
      {selected && (
        <div
          className="absolute flex -translate-x-1/2 translate-y-2 items-start gap-2 rounded-md border bg-background p-2 text-sm shadow"
          style={toScreen(selected.lng, selected.lat)}
        >
          <span>
            <span className="block font-medium">{selected.name}</span>
            <span className="block text-xs text-muted-foreground">
              {selected.region}
            </span>
          </span>
          <button type="button" aria-label="Close" onClick={onDismiss}>
            <X className="size-4" />
          </button>
        </div>
      )}
      <div className="absolute top-3 right-3 flex flex-col gap-1">
        <Button
          size="icon-sm"
          variant="outline"
          aria-label="Zoom in"
          onClick={() => onZoom(1)}
        >
          <Plus />
        </Button>
        <Button
          size="icon-sm"
          variant="outline"
          aria-label="Zoom out"
          onClick={() => onZoom(-1)}
        >
          <Minus />
        </Button>
      </div>
      <span className="absolute right-1 bottom-1 rounded bg-background/80 px-1 text-[10px] text-muted-foreground">
        © OpenStreetMap contributors
      </span>
    </div>
  );
};
