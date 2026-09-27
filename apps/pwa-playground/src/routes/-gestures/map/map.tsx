import { GestureZone, useHold } from 'kui-toolkit/components/blocks/gestures';
import { Button } from 'kui-toolkit/components/ui/button';
import { LayersIcon, MapPinIcon, ScanIcon } from 'kui-toolkit/lucide';
import { motion, useReducedMotion, useTransform } from 'kui-toolkit/motion';
import { type RefObject, useEffect, useRef, useState } from 'react';
import { useElementSize } from '../element-size/index.ts';
import { useMapGestures } from './gestures.ts';
import { type Layer, LAYERS, World, WORLD_PX } from './world.tsx';

export { mapTutorial } from './tutorial.tsx';

type Point = { readonly x: number; readonly y: number };

/** What the Hold down right now lets you do, so the modes can be found. */
function HoldHint() {
  const hold = useHold();
  if (hold === undefined) return null;
  return (
    <p
      data-testid="map-hold"
      data-side={hold.side}
      className="pointer-events-none absolute inset-x-0 top-2 mx-auto w-fit rounded-full bg-popover px-3 py-1 text-xs text-popover-foreground shadow"
    >
      {hold.side === 'left'
        ? 'Left Hold: tap to drop a pin'
        : 'Right Hold: swipe up or down to change the layer'}
    </p>
  );
}

function MapView(props: { readonly zone: RefObject<HTMLDivElement | null> }) {
  const size = useElementSize(props.zone);
  const [pins, setPins] = useState<ReadonlyArray<Point>>([]);
  const [layer, setLayer] = useState<Layer>('Dots');
  const reducedMotion = useReducedMotion();
  const map = useMapGestures({
    size,
    origin: () => {
      const box = props.zone.current?.getBoundingClientRect();
      return { x: box?.left ?? 0, y: box?.top ?? 0 };
    },
    onPin: (at) => setPins((list) => [...list, at]),
    onLayer: (step) =>
      setLayer((current) => {
        const index = LAYERS.indexOf(current) + step;
        return LAYERS[(index + LAYERS.length) % LAYERS.length] ?? 'Dots';
      }),
  });
  // Pins keep their size whatever the zoom.
  const pinScale = useTransform(map.scale, (value) => 1 / value);
  const fitted = useRef(false);
  useEffect(() => {
    if (fitted.current || size.width === 0) return;
    fitted.current = true;
    map.x.jump((size.width - WORLD_PX * map.scale.get()) / 2);
    map.y.jump((size.height - WORLD_PX * map.scale.get()) / 2);
  }, [map, size]);

  return (
    <>
      <motion.div
        data-testid="map-world"
        data-layer={layer}
        data-pins={pins.length}
        style={{ x: map.x, y: map.y, scale: map.scale, originX: 0, originY: 0 }}
        className="absolute top-0 left-0"
      >
        <World layer={layer} />
        {pins.map((pin, index) => (
          <motion.span
            key={index}
            style={{ left: pin.x, top: pin.y }}
            initial={reducedMotion ? false : { opacity: 0, scale: 0.95, y: 4 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{
              duration: reducedMotion ? 0 : 0.18,
              ease: [0.32, 0.72, 0, 1],
            }}
            className="absolute text-chart-9"
          >
            <motion.span
              style={{ x: '-50%', y: '-100%', scale: pinScale, originY: 1 }}
              className="block"
            >
              <MapPinIcon
                aria-hidden="true"
                className="size-7 fill-background"
              />
            </motion.span>
          </motion.span>
        ))}
      </motion.div>
      <HoldHint />
      <div
        data-gestures="off"
        className="absolute right-3 bottom-3 flex items-center gap-2"
      >
        <span className="flex items-center gap-1 rounded-full bg-popover px-2.5 py-1 text-xs text-popover-foreground shadow">
          <LayersIcon aria-hidden="true" className="size-3.5" />
          {layer}
        </span>
        <Button
          variant="secondary"
          size="icon"
          aria-label="Fit the map"
          onClick={map.fit}
        >
          <ScanIcon aria-hidden="true" />
        </Button>
      </div>
    </>
  );
}

/** Map: a generated town to pan, zoom, pin and restyle, in a zone of its own. */
export function MapScreen() {
  const zone = useRef<HTMLDivElement>(null);
  return (
    <GestureZone
      ref={zone}
      scroll="none"
      data-testid="map-zone"
      className="relative h-full overflow-hidden bg-muted"
    >
      <MapView zone={zone} />
    </GestureZone>
  );
}
