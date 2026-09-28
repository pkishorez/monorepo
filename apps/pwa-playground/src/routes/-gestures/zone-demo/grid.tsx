import {
  type GestureEnd,
  type GestureState,
  type Hold,
  type Point,
  useGesture,
  useHold,
} from '@kstackz/ui-toolkit/components/blocks/gestures';
import { animate, useMotionValueEvent } from '@kstackz/ui-toolkit/motion';
import { cn } from '@kstackz/ui-toolkit/utils';
import {
  type RefObject,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
} from 'react';
import { type Camera, follow, matrixOf, settle } from './camera.ts';
import { type Coast, cap, glide } from './glide.ts';

const MINOR = 40;
const MAJOR = 200;

// The fastest a released grid carries on: px, zoom (log of scale) and
// degrees per second.
const MAX_PAN = 5000;
const MAX_ZOOM = 3;
const MAX_TURN = 540;

// Where 0,0 is on screen, relative to where it started, then zoom and turn.
const readout = (camera: Camera, home: Camera) =>
  `${Math.round(camera.x - home.x)}, ${Math.round(camera.y - home.y)} · ×${camera.scale.toFixed(2)} · ${Math.round(camera.rotation)}°`;

type Steering = {
  readonly gesture: GestureState;
  /** Where its current Gesture started, in the grid's px. */
  readonly origin: RefObject<Point>;
};

// One Hold's Gestures steering the grid: each is released into the camera,
// and its values start over. An interrupted one is dropped.
function useSteering(
  hold: Hold,
  svg: RefObject<SVGSVGElement | null>,
  release: (end: GestureEnd, origin: Point) => void,
): Steering {
  const origin = useRef<Point>({ x: 0, y: 0 });
  const gesture = useGesture({
    hold,
    onEnd: (end) => {
      if (!end.interrupted) release(end, origin.current);
      gesture.x.jump(0);
      gesture.y.jump(0);
      gesture.scale.jump(1);
      gesture.rotation.jump(0);
    },
  });

  useLayoutEffect(() => {
    const box = svg.current?.getBoundingClientRect();
    if (gesture.origin === undefined || box === undefined) return;
    origin.current = {
      x: gesture.origin.x - box.left,
      y: gesture.origin.y - box.top,
    };
  }, [gesture.origin, svg]);

  return { gesture, origin };
}

function useRedraw(gesture: GestureState, draw: () => void) {
  useMotionValueEvent(gesture.x, 'change', draw);
  useMotionValueEvent(gesture.y, 'change', draw);
  useMotionValueEvent(gesture.scale, 'change', draw);
  useMotionValueEvent(gesture.rotation, 'change', draw);
}

const valuesOf = ({ gesture }: Steering) => ({
  x: gesture.x.get(),
  y: gesture.y.get(),
  scale: gesture.scale.get(),
  rotation: gesture.rotation.get(),
});

/**
 * An endless grid steered by every Gesture with no Hold or under the left
 * Hold, wherever it lands: one finger pans, two also zoom and turn about the
 * first finger. The grid keeps its own camera; each Gesture moves it and is
 * folded in on release, then carries on at the speed it was let go with.
 * `reset` changing springs it back home. Under the right Hold it rests.
 */
export function InfiniteGrid(props: { readonly reset: number }) {
  const id = useId();
  const hold = useHold();
  const svg = useRef<SVGSVGElement>(null);
  const layers = useRef<Array<SVGElement | null>>([]);
  const text = useRef<HTMLSpanElement>(null);
  const camera = useRef<Camera | undefined>(undefined);
  const home = useRef<Camera | undefined>(undefined);
  // A release gliding on, or a reset springing home.
  const coasting = useRef<Coast | undefined>(undefined);

  // Folds the Gesture into the camera, then lets it glide on about the point
  // under the finger, slowing to a stop.
  function release(end: GestureEnd, origin: Point) {
    if (camera.current === undefined) return;
    camera.current = follow(camera.current, end, origin);
    const pivot = { x: origin.x + end.x, y: origin.y + end.y };
    const { velocity } = end;
    coasting.current?.stop();
    coasting.current = glide(
      [
        cap(velocity.x, MAX_PAN),
        cap(velocity.y, MAX_PAN),
        cap(velocity.scale / end.scale, MAX_ZOOM),
        cap(velocity.rotation, MAX_TURN),
      ],
      ([x = 0, y = 0, zoom = 0, rotation = 0]) => {
        if (camera.current === undefined) return false;
        const step = { x, y, scale: Math.exp(zoom), rotation };
        camera.current = follow(camera.current, step, pivot);
        pivot.x += x;
        pivot.y += y;
        draw();
      },
    );
  }
  const plain = useSteering('none', svg, release);
  const left = useSteering('left', svg, release);

  const draw = useCallback(() => {
    if (camera.current === undefined) return;
    let shown = camera.current;
    for (const steering of [plain, left]) {
      shown = follow(shown, valuesOf(steering), steering.origin.current);
    }
    const matrix = matrixOf(shown);
    for (const layer of layers.current) {
      layer?.setAttribute(
        layer.tagName === 'pattern' ? 'patternTransform' : 'transform',
        matrix,
      );
    }
    if (text.current !== null && home.current !== undefined) {
      text.current.textContent = readout(shown, home.current);
    }
  }, [plain, left]);

  // Start with the world's 0,0 in the middle of the grid.
  useLayoutEffect(() => {
    const box = svg.current?.getBoundingClientRect();
    if (box === undefined || camera.current !== undefined) return;
    camera.current = {
      x: box.width / 2,
      y: box.height / 2,
      scale: 1,
      rotation: 0,
    };
    home.current = camera.current;
    draw();
  }, [draw]);

  useRedraw(plain.gesture, draw);
  useRedraw(left.gesture, draw);

  // A finger landing catches the grid, gliding or springing home.
  const steering = plain.gesture.active || left.gesture.active;
  useLayoutEffect(() => {
    if (steering) coasting.current?.stop();
  }, [steering]);

  useEffect(() => {
    const from = camera.current;
    const to = home.current;
    if (props.reset === 0 || from === undefined || to === undefined) return;
    coasting.current?.stop();
    const controls = animate(0, 1, {
      type: 'spring',
      stiffness: 220,
      damping: 28,
      onUpdate: (progress) => {
        camera.current = settle(from, to, progress);
        draw();
      },
      onComplete: () => {
        camera.current = to;
        draw();
      },
    });
    coasting.current = controls;
    return () => controls.stop();
  }, [props.reset, draw]);

  const layer = (index: number) => (node: SVGElement | null) => {
    layers.current[index] = node;
  };

  return (
    <section
      data-testid="zone-grid-section"
      data-resting={hold === 'right' ? '' : undefined}
      className={cn(
        'relative min-h-0 flex-1 overflow-hidden border-b border-border bg-muted/30 transition-[opacity,filter] duration-200',
        hold === 'right' && 'opacity-35 grayscale',
      )}
    >
      <svg
        ref={svg}
        data-testid="zone-grid"
        className="absolute inset-0 size-full"
      >
        <defs>
          <pattern
            ref={layer(0)}
            id={`${id}-minor`}
            width={MINOR}
            height={MINOR}
            patternUnits="userSpaceOnUse"
          >
            <path
              d={`M ${MINOR} 0 L 0 0 0 ${MINOR}`}
              fill="none"
              stroke="var(--border)"
            />
          </pattern>
          <pattern
            ref={layer(1)}
            id={`${id}-major`}
            width={MAJOR}
            height={MAJOR}
            patternUnits="userSpaceOnUse"
          >
            <path
              d={`M ${MAJOR} 0 L 0 0 0 ${MAJOR}`}
              fill="none"
              stroke="var(--muted-foreground)"
              strokeOpacity={0.5}
            />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill={`url(#${id}-minor)`} />
        <rect width="100%" height="100%" fill={`url(#${id}-major)`} />
        <g ref={layer(2)}>
          <circle r={6} fill="var(--primary)" />
          <path
            d="M 0 -40 L 0 40 M -40 0 L 40 0"
            stroke="var(--primary)"
            strokeWidth={2}
          />
          <path d="M 0 -64 L -10 -46 L 10 -46 Z" fill="var(--primary)" />
          <text
            x={10}
            y={20}
            className="fill-muted-foreground font-mono text-[11px] select-none"
          >
            0, 0
          </text>
        </g>
      </svg>
      <p className="pointer-events-none absolute inset-x-3 top-2 flex items-baseline justify-between gap-2 text-xs text-muted-foreground">
        <span className="shrink-0">useGesture · no Hold, left</span>
        <span
          ref={text}
          data-testid="grid-readout"
          className="font-mono tabular-nums"
        />
      </p>
    </section>
  );
}
