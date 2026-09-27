import { useEffect, useRef, type ReactNode } from 'react';
import { cn } from '#lib/utils';
import type { ZoneSource } from '../provider';

/** One frame to paint, in viewport CSS pixels. */
export type Frame = {
  readonly ctx: CanvasRenderingContext2D;
  readonly now: number;
  readonly width: number;
  readonly height: number;
  /** A colour custom property of the layer, as an rgba() string. */
  readonly color: (property: string, alpha?: number) => string;
  readonly font: string;
};

/** Paints one frame; returns whether it needs the next one too. */
export type Painter = (frame: Frame) => boolean;

type Rgb = readonly [number, number, number];

// Canvas takes no var() or alpha on a token, so each token value is resolved
// to its sRGB channels once, by painting it into a single pixel.
const createColorResolver = () => {
  const probe = document.createElement('canvas');
  probe.width = 1;
  probe.height = 1;
  const ctx = probe.getContext('2d', { willReadFrequently: true });
  const cache = new Map<string, Rgb>();
  return (value: string): Rgb => {
    const cached = cache.get(value);
    if (cached !== undefined) return cached;
    if (ctx === null) return [0, 0, 0];
    ctx.clearRect(0, 0, 1, 1);
    ctx.fillStyle = value;
    ctx.fillRect(0, 0, 1, 1);
    const [r = 0, g = 0, b = 0] = ctx.getImageData(0, 0, 1, 1).data;
    const rgb: Rgb = [r, g, b];
    cache.set(value, rgb);
    return rgb;
  };
};

const fitToViewport = (canvas: HTMLCanvasElement, win: Window) => {
  const dpr = win.devicePixelRatio || 1;
  const width = Math.round(win.innerWidth * dpr);
  const height = Math.round(win.innerHeight * dpr);
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
  return dpr;
};

/**
 * A viewport-sized canvas above the page that never takes input. It paints
 * one animation frame at a time: after zone input, on any scroll or resize,
 * and for as long as `paint` asks for more.
 */
export function CanvasLayer(props: {
  readonly source: ZoneSource;
  readonly paint: Painter;
  readonly testId: string;
  readonly className?: string;
  readonly children?: ReactNode;
}) {
  const { source } = props;
  const rootRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const paintRef = useRef(props.paint);

  useEffect(() => {
    paintRef.current = props.paint;
  });

  useEffect(() => {
    const root = rootRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (root === null || canvas === null || ctx === null || ctx === undefined) {
      return;
    }
    const win = root.ownerDocument.defaultView ?? window;
    const resolve = createColorResolver();
    let frame = 0;

    const draw = () => {
      frame = 0;
      const dpr = fitToViewport(canvas, win);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, win.innerWidth, win.innerHeight);
      const style = win.getComputedStyle(root);
      const more = paintRef.current({
        ctx,
        now: win.performance.now(),
        width: win.innerWidth,
        height: win.innerHeight,
        color: (property, alpha = 1) => {
          const [r, g, b] = resolve(style.getPropertyValue(property).trim());
          return `rgba(${r}, ${g}, ${b}, ${alpha})`;
        },
        font: style.fontFamily,
      });
      if (more) request();
    };
    const request = () => {
      if (frame === 0) frame = win.requestAnimationFrame(draw);
    };

    const stop = source.subscribe(request);
    // The zone moves under a native scroll, its own included, with no input.
    win.addEventListener('scroll', request, { capture: true, passive: true });
    win.addEventListener('resize', request);
    request();
    return () => {
      stop();
      win.removeEventListener('scroll', request, { capture: true });
      win.removeEventListener('resize', request);
      win.cancelAnimationFrame(frame);
    };
  }, [source]);

  return (
    <div
      ref={rootRef}
      data-testid={props.testId}
      className={cn('pointer-events-none fixed inset-0', props.className)}
    >
      <canvas
        ref={canvasRef}
        aria-hidden="true"
        className="absolute inset-0 size-full"
      />
      {props.children}
    </div>
  );
}
