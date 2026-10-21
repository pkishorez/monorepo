import { useEffect, useRef } from 'react';
import type { ComponentProps } from 'react';
import { column } from '../components/index.ts';
import { startBaking } from './baker.ts';
import { budget, governor } from './budget.ts';
import { card, stretch, words } from './card.ts';
import { logger } from './debug.ts';
import { measure } from './chapters.ts';
import type { Chapter, Side } from './chapters.ts';
import { ease, spring } from './damp.ts';
import { comet } from './follower.ts';
import { loop } from './loop.ts';
import { watchMotion } from './motion.ts';
import { painter } from './painter.ts';
import { WIDE, place } from './placement.ts';
import type { Spot } from './placement.ts';
import { trackPointer } from './pointer.ts';
import { progress } from './scroll.ts';
import { DISTANCE, scene } from './stage.ts';
import type { Baked } from './shapes/index.ts';
import { watchTheme } from './theme.ts';

/*
 * The Field: one cloud of fine points fixed behind a page, taking the
 * shape of each Chapter as the reader scrolls to it. A page marks its
 * Chapters with `shapeAt`, or tells them as Stops, which also lay out
 * their words where the shape leaves room. The canvas is
 * drawn on the server, empty and transparent; in the browser it bakes the
 * shapes in a Worker, watches the scroll, pointer and theme, and draws
 * every frame.
 * With `follower`, a comet travels down the page with the reader.
 * Without WebGL2 it draws nothing and the page reads the same.
 */

export function Field({ follower }: { readonly follower: boolean }) {
  const stage = useRef<HTMLDivElement>(null);
  const journey = useRef(follower);
  useEffect(() => {
    journey.current = follower;
  }, [follower]);
  useEffect(() => {
    // Each mount draws on a canvas of its own, and gives its GPU context
    // back when it goes, so moving between pages leaves nothing behind.
    const el = stage.current;
    if (!el) return;
    const canvas = document.createElement('canvas');
    canvas.className =
      'block h-full w-full opacity-0 transition-opacity duration-700 ease-out';
    el.appendChild(canvas);
    const stop = run(canvas, () => journey.current);
    return () => {
      stop();
      canvas.remove();
    };
  }, []);
  return (
    <div
      ref={stage}
      aria-hidden
      className="pointer-events-none fixed inset-x-0 top-0 z-0 h-lvh w-full"
    />
  );
}

/**
 * Marks a part of the page with the shape the field takes while it is in
 * view, and the half of a wide screen that shape sits in.
 */
export const shapeAt = (shape: string, side: Side = 'center') => ({
  'data-field-shape': shape,
  'data-field-side': side,
});

/**
 * One stop of a story told over the field: a tall stretch of page while
 * its shape forms and holds, and a card of words beside it. `side` is where
 * the shape sits on a wide screen; the card takes the other half.
 */
export function Stop({
  shape,
  side = 'right',
  children,
  ...section
}: {
  readonly shape: string;
  readonly side?: 'left' | 'right';
} & ComponentProps<'section'>) {
  return (
    <section {...section} {...shapeAt(shape, side)} className={stretch}>
      <div
        className={`${column} sticky bottom-0 lg:static lg:grid lg:grid-cols-2 lg:gap-16`}
      >
        <div className={`${card} ${side === 'left' ? 'lg:col-start-2' : ''}`}>
          <div className={words}>{children}</div>
        </div>
      </div>
    </section>
  );
}

function run(canvas: HTMLCanvasElement, journey: () => boolean): () => void {
  const log = logger();
  log.debug(
    'mount',
    location.pathname,
    `${innerWidth}x${innerHeight}@${devicePixelRatio}`,
  );
  const gl = canvas.getContext('webgl2', {
    alpha: true,
    premultipliedAlpha: true,
    antialias: false,
    depth: false,
    stencil: false,
    powerPreference: 'high-performance',
  });
  if (!gl) {
    log.warn(
      'no WebGL2 here (is hardware acceleration or WebGL turned off?); the field is off',
    );
    return () => {};
  }
  if (log.on) {
    const info = gl.getExtension('WEBGL_debug_renderer_info');
    log.debug(
      'WebGL2 on',
      info
        ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL)
        : gl.getParameter(gl.RENDERER),
    );
  }

  // Read the page: its Chapters and size, again only when the layout may
  // change. Only the shapes it names are baked, in the order it shows them.
  const plan = budget();
  let chapters: Chapter[] = [];
  let spots: Spot[] = [];
  let viewHeight = window.innerHeight;
  let cssWidth = 0;
  let cssHeight = 0;
  let alive = true;
  const remeasure = () => {
    if (!alive) return;
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    // A phone's toolbar sliding away changes only the height: ignore it.
    const heightOnly = plan.small && w === cssWidth && cssHeight > 0;
    if (!heightOnly) {
      cssWidth = w;
      cssHeight = h;
      viewHeight = window.innerHeight;
    }
    chapters = measure();
    spots = chapters.map((c) => place(c.side, cssWidth, cssHeight));
  };
  remeasure();
  const resizes = new ResizeObserver(remeasure);
  resizes.observe(document.body);
  window.addEventListener('resize', remeasure);
  void document.fonts?.ready.then(remeasure);

  const cast = [...new Set(chapters.map((c) => c.shape))];
  const layers = cast.length;

  // Mount: as many particles as this device can carry. Shaders that will
  // not build turn the field off, never the page.
  log.debug('chapters', chapters.map((c) => `${c.shape}:${c.side}`).join(' '));
  log.debug(
    'budget',
    `${plan.width * plan.rows} particles`,
    `dpr ${plan.dpr}`,
    plan.small ? 'small screen' : 'wide screen',
  );
  let paint: ReturnType<typeof painter>;
  try {
    paint = painter(gl, { ...plan, layers });
  } catch (e) {
    log.error('the field could not start; it is off.', e);
    resizes.disconnect();
    window.removeEventListener('resize', remeasure);
    return () => {};
  }

  // Bake, off the main thread: each shape is uploaded as it arrives, and
  // nothing is drawn until the first Chapter's is here.
  const baked: Array<Baked | undefined> = [];
  const ready = cast.map(() => false);
  const stopBaking = startBaking(
    plan.width * plan.rows,
    cast,
    (index, shape) => {
      baked[index] = shape;
      if (!gl.isContextLost()) paint.layer(index, shape);
      ready[index] = true;
    },
    log,
  );

  const pointer = trackPointer();
  const theme = watchTheme();
  const motion = watchMotion();
  const tail = comet();
  const sharpness = governor(plan.dpr);

  // The loop: everything eased, nothing read from the layout.
  const t = spring(progress(chapters, window.scrollY, viewHeight), 0.15);
  let time = 0;
  let still = motion.calm() ? 0 : 1;
  let intro = motion.calm() ? 1 : 0;
  let dark = theme.dark() ? 1 : 0;
  const reach = { x: 0, y: 0, strength: 0, yaw: 0, tilt: 0 };
  let shown = false;
  let lastDpr = plan.dpr;
  // Nothing on screen a while after mounting is the one failure a reader
  // sees as "it does not work": say what the field is waiting for.
  const late = window.setTimeout(() => {
    if (shown) return;
    const missing = cast.filter((_, index) => !ready[index]);
    log.warn(
      'nothing drawn 3 s after mounting.',
      missing.length > 0
        ? `Still waiting for shapes: ${missing.join(', ')}.`
        : 'Every shape is baked; the loop has not drawn.',
      document.hidden ? 'The tab is hidden.' : '',
      'Add ?debug to the URL for the full trace.',
    );
  }, 3000);
  let lastDrawn = '';

  const frames = loop((_, dt) => {
    if (!ready[0]) return;
    const calm = motion.calm();
    still = ease(still, calm ? 0 : 1, 0.5, dt);
    time += dt * still;
    intro = calm ? 1 : Math.min(1, intro + dt / 1.4);
    const darkTarget = theme.dark() ? 1 : 0;
    dark +=
      Math.sign(darkTarget - dark) *
      Math.min(Math.abs(darkTarget - dark), dt / 0.3);
    const at = t.step(progress(chapters, window.scrollY, viewHeight), dt);

    // The pointer, in world units on screen; it fades in where it is.
    const aspect = cssWidth / Math.max(cssHeight, 1);
    const px = ((pointer.x / Math.max(cssWidth, 1)) * 2 - 1) * aspect;
    const py = 1 - (pointer.y / Math.max(cssHeight, 1)) * 2;
    const present = calm ? 0 : pointer.target();
    if (reach.strength < 0.01) {
      reach.x = px;
      reach.y = py;
    }
    reach.x = ease(reach.x, px, 0.12, dt);
    reach.y = ease(reach.y, py, 0.12, dt);
    reach.strength = ease(reach.strength, present, 0.35, dt);
    const leans = !plan.small && cssWidth >= WIDE && !calm;
    reach.yaw = ease(reach.yaw, leans ? (px / aspect) * 0.1 : 0, 0.8, dt);
    reach.tilt = ease(reach.tilt, leans ? -py * 0.06 : 0, 0.8, dt);

    tail.step({ t: at, time, dt, spots, aspect, on: journey() });

    // A reader who asked for less motion: draw only when something changed.
    const dpr = sharpness(dt);
    if (dpr !== lastDpr) {
      log.debug('frames are slow; sharpness down to dpr', dpr.toFixed(2));
      lastDpr = dpr;
    }
    const width = Math.round(cssWidth * dpr);
    const height = Math.round(cssHeight * dpr);
    const key = `${at}|${dark}|${width}|${height}|${still}|${tail.head[3]}|${ready.join()}`;
    if (calm && key === lastDrawn) return;
    lastDrawn = key;
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }

    const { a, b, blend } = scene({
      chapters,
      spots,
      t: at,
      time,
      cast,
      ready,
      lean: [reach.yaw, reach.tilt],
      comet: tail.head[3],
    });
    paint.paint({
      width,
      height,
      size: 1.55 * dpr,
      aspect,
      distance: DISTANCE,
      time,
      motion: still,
      intro,
      dark,
      blend,
      a,
      b,
      pointer: [reach.x, reach.y, reach.strength],
      comet: tail.head,
      ribbon: tail.ribbon,
      ribbonCount: tail.ribbonCount,
    });
    if (!shown) {
      shown = true;
      canvas.style.opacity = '1';
      log.debug(
        'first frame drawn',
        `${width}x${height}`,
        dark > 0.5 ? 'dark' : 'light',
        calm ? 'reduced motion' : '',
      );
    }
  });

  // A lost context comes back empty: rebuild, refill, carry on.
  let warnedLost = false;
  const lost = (e: Event) => {
    e.preventDefault();
    if (!warnedLost) {
      warnedLost = true;
      log.warn('WebGL context lost; waiting for it to come back');
    }
    frames.pause();
  };
  const restored = () => {
    log.debug('WebGL context restored');
    paint = painter(gl, { ...plan, layers });
    baked.forEach((shape, index) => shape && paint.layer(index, shape));
    lastDrawn = '';
    frames.resume();
  };
  canvas.addEventListener('webglcontextlost', lost);
  canvas.addEventListener('webglcontextrestored', restored);

  return () => {
    log.debug('unmount');
    window.clearTimeout(late);
    alive = false;
    frames.dispose();
    stopBaking();
    resizes.disconnect();
    window.removeEventListener('resize', remeasure);
    canvas.removeEventListener('webglcontextlost', lost);
    canvas.removeEventListener('webglcontextrestored', restored);
    pointer.dispose();
    theme.dispose();
    motion.dispose();
    paint.dispose();
    gl.getExtension('WEBGL_lose_context')?.loseContext();
  };
}
