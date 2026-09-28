import { useGesture } from '@kstackz/ui-toolkit/components/blocks/gestures';
import { useMotionValueEvent } from '@kstackz/ui-toolkit/motion';
import { useCallback, useId, useLayoutEffect, useRef } from 'react';
import { type Camera, follow, matrixOf } from './camera.ts';

const MINOR = 40;
const MAJOR = 200;

// Where 0,0 is on screen, relative to where it started, then zoom and turn.
const readout = (camera: Camera, home: Camera) =>
  `${Math.round(camera.x - home.x)}, ${Math.round(camera.y - home.y)} · ×${camera.scale.toFixed(2)} · ${Math.round(camera.rotation)}°`;

/**
 * An endless grid steered by every Gesture in the zone, wherever it lands:
 * one finger pans, two also zoom and turn about the first finger. The grid
 * keeps its own camera; each Gesture moves it and is folded in on release.
 */
export function InfiniteGrid() {
  const id = useId();
  const svg = useRef<SVGSVGElement>(null);
  const layers = useRef<Array<SVGElement | null>>([]);
  const text = useRef<HTMLSpanElement>(null);
  const camera = useRef<Camera | undefined>(undefined);
  const home = useRef<Camera | undefined>(undefined);
  // Where the current Gesture started, in the grid's px.
  const origin = useRef({ x: 0, y: 0 });

  const gesture = useGesture({
    onEnd: (end) => {
      if (camera.current === undefined) return;
      camera.current = follow(camera.current, end, origin.current);
      // The camera now holds this Gesture, so the values start over here.
      gesture.x.jump(0);
      gesture.y.jump(0);
      gesture.scale.jump(1);
      gesture.rotation.jump(0);
    },
  });

  const draw = useCallback(() => {
    if (camera.current === undefined) return;
    const shown = follow(
      camera.current,
      {
        x: gesture.x.get(),
        y: gesture.y.get(),
        scale: gesture.scale.get(),
        rotation: gesture.rotation.get(),
      },
      origin.current,
    );
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
  }, [gesture]);

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

  useLayoutEffect(() => {
    const box = svg.current?.getBoundingClientRect();
    if (gesture.origin === undefined || box === undefined) return;
    origin.current = {
      x: gesture.origin.x - box.left,
      y: gesture.origin.y - box.top,
    };
  }, [gesture.origin]);

  useMotionValueEvent(gesture.x, 'change', draw);
  useMotionValueEvent(gesture.y, 'change', draw);
  useMotionValueEvent(gesture.scale, 'change', draw);
  useMotionValueEvent(gesture.rotation, 'change', draw);

  const layer = (index: number) => (node: SVGElement | null) => {
    layers.current[index] = node;
  };

  return (
    <section className="relative min-h-0 flex-1 overflow-hidden border-b border-border bg-muted/30">
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
        <span className="shrink-0">useGesture</span>
        <span
          ref={text}
          data-testid="grid-readout"
          className="font-mono tabular-nums"
        />
      </p>
    </section>
  );
}
