import { GestureZone } from 'kui-toolkit/components/blocks/gestures';
import { Button } from 'kui-toolkit/components/ui/button';
import { ChevronLeftIcon, ChevronRightIcon } from 'kui-toolkit/lucide';
import { motion } from 'kui-toolkit/motion';
import { type RefObject, useRef } from 'react';
import { useElementSize } from '../element-size/index.ts';
import { usePhotoGestures } from './gestures.ts';
import { Photo, SCENES } from './scenes.tsx';

export { photosTutorial } from './tutorial.tsx';

function Viewer(props: { readonly zone: RefObject<HTMLDivElement | null> }) {
  const size = useElementSize(props.zone);
  const photos = usePhotoGestures({
    count: SCENES.length,
    size,
    origin: () => {
      const box = props.zone.current?.getBoundingClientRect();
      return { x: box?.left ?? 0, y: box?.top ?? 0 };
    },
  });
  return (
    <>
      <motion.div
        data-testid="photos-strip"
        data-index={photos.index}
        data-zoomed={photos.zoomed ? '' : undefined}
        style={{
          x: photos.stripX,
          y: photos.dismissY,
          scale: photos.dismissScale,
          opacity: photos.dismissOpacity,
          width: size.width * SCENES.length,
        }}
        className="absolute inset-y-0 left-0 flex"
      >
        {SCENES.map((scene, index) => (
          <div
            key={scene.title}
            className="relative h-full shrink-0 overflow-hidden"
            style={{ width: size.width }}
          >
            {index === photos.index ? (
              <motion.div
                data-testid="photos-current"
                style={{
                  x: photos.x,
                  y: photos.y,
                  scale: photos.scale,
                  originX: 0,
                  originY: 0,
                }}
                className="absolute inset-0 p-4"
              >
                <Photo index={index} />
              </motion.div>
            ) : (
              <div className="absolute inset-0 p-4">
                <Photo index={index} />
              </div>
            )}
          </div>
        ))}
      </motion.div>
      <div
        data-gestures="off"
        className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-2 bg-linear-to-t from-background/90 to-transparent px-3 pt-6 pb-2"
      >
        <Button
          variant="ghost"
          size="icon"
          aria-label="Previous photo"
          disabled={photos.index === 0 || photos.zoomed}
          onClick={photos.previous}
        >
          <ChevronLeftIcon aria-hidden="true" />
        </Button>
        <p className="min-w-0 truncate text-center text-sm">
          <span className="font-medium">{SCENES[photos.index]?.title}</span>{' '}
          <span className="text-muted-foreground tabular-nums">
            {photos.index + 1} / {SCENES.length}
          </span>
        </p>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Next photo"
          disabled={photos.index === SCENES.length - 1 || photos.zoomed}
          onClick={photos.next}
        >
          <ChevronRightIcon aria-hidden="true" />
        </Button>
      </div>
    </>
  );
}

/** Photos: a viewer of generated photos in a zone of its own. */
export function PhotosScreen() {
  const zone = useRef<HTMLDivElement>(null);
  return (
    <GestureZone
      ref={zone}
      scroll="none"
      data-testid="photos-zone"
      className="relative h-full overflow-hidden bg-muted/40"
    >
      <Viewer zone={zone} />
    </GestureZone>
  );
}
