import { useEffect, useRef } from 'react';
import type { ComponentProps } from 'react';
import { startBaking } from './baker.ts';
import { budget, governor } from './budget.ts';
import {
  card,
  curtain,
  compact,
  ending,
  halves,
  opening,
  rise,
  stretch,
} from './card.ts';
import { logger } from './debug.ts';
import { measure, storyEnd, storyStart } from './chapters.ts';
import type { Chapter, Side } from './chapters.ts';
import { ease, spring } from './damp.ts';
import { comet } from './follower.ts';
import { loop } from './loop.ts';
import { watchMotion } from './motion.ts';
import { painter } from './painter.ts';
import { WIDE, place, room } from './placement.ts';
import type { Spot } from './placement.ts';
import { progress } from './scroll.ts';
import { smoothScroll } from './smooth.ts';
import { DISTANCE, scene } from './stage.ts';
import { formedOf, labelLayer } from './labels.ts';
import type { Baked } from './shapes/index.ts';
import { watchTheme } from './theme.ts';

/*
 * The Field: one cloud of fine points fixed behind a page, taking the
 * shape of each Chapter as the reader scrolls to it. A page marks its
 * Chapters with `shapeAt`, or tells them as Stops, which also lay out
 * their words where the shape leaves room. The canvas is
 * drawn on the server, empty and transparent; in the browser it bakes the
 * shapes in a Worker, watches the scroll and theme, and draws
 * every frame.
 * While it is mounted the page's scroll glides (smooth.ts), so the words
 * and the shapes move together.
 * With `follower`, a comet travels down the page with the reader, on a
 * wide screen.
 * Without WebGL2 it draws nothing and the page reads the same.
 */

export function Field({ follower }: { readonly follower: boolean }) {
  const stage = useRef<HTMLDivElement>(null);
  const veil = useRef<HTMLDivElement>(null);
  const edge = useRef<HTMLDivElement>(null);
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
    // The scroll glides first, so each frame the field reads where it is.
    const unsmooth = smoothScroll();
    const stop = run(canvas, () => journey.current, [
      veil.current,
      edge.current,
    ]);
    return () => {
      unsmooth();
      stop();
      canvas.remove();
    };
  }, []);
  return (
    <>
      {/* On a phone the words rise out of a soft bottom edge and pass into
          the stage's curtain, with the field drawn sharp above it. Both
          come in with the scroll, once the story starts. */}
      <div ref={veil} aria-hidden className={curtain} />
      <div ref={edge} aria-hidden className={rise} />
      <div
        ref={stage}
        aria-hidden
        className="pointer-events-none fixed inset-x-0 top-0 z-[3] h-lvh w-full lg:z-0"
      />
    </>
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
 * One stop of a story told over the field: a screen of scroll, its words
 * in the middle of it, taking the half of a wide screen its shape leaves
 * free. On a phone the shape holds the top of the screen and the words
 * scroll up from below it, passing into its curtain as they go. `first`
 * opens a page: one screen less the header, its words low on a phone,
 * where they are read. `last` ends one, its words low on a phone too, so
 * they are read when the page can scroll no further. `tight` takes less
 * scroll, for small shapes.
 */
export function Stop({
  shape,
  side = 'right',
  first = false,
  last = false,
  tight = false,
  children,
  ...section
}: {
  readonly shape: string;
  readonly side?: Side;
  readonly first?: boolean;
  readonly last?: boolean;
  readonly tight?: boolean;
} & ComponentProps<'section'>) {
  return (
    <section
      {...section}
      {...shapeAt(shape, side)}
      className={first ? opening : last ? ending : tight ? compact : stretch}
    >
      <div className={halves}>
        <div data-field-words className={card(side, first)}>
          {children}
        </div>
      </div>
    </section>
  );
}

function run(
  canvas: HTMLCanvasElement,
  journey: () => boolean,
  veils: ReadonlyArray<HTMLElement | null>,
): () => void {
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
  /** Where the story's words start, down the page. */
  let start: number | null = null;
  /** Where the story ends, down the page, if the page marks it. */
  let end: number | null = null;
  /**
   * The line being read, down the screen: its middle on a wide screen; on
   * a phone, the middle of what the stage leaves below it.
   */
  const focus = () =>
    cssWidth < WIDE
      ? (room(viewHeight).bottom + viewHeight) / 2
      : viewHeight / 2;
  const stage = canvas.parentElement;
  const words = labelLayer(stage ?? canvas, log.on);
  /**
   * How far the field has handed the page over to what follows its story,
   * 0..1, between when the end's first words are `from` and `to` of the
   * way down the screen; never before the last Chapter has been read,
   * held whole.
   */
  const left = (
    all: readonly Chapter[],
    at: number,
    line: number,
    [high, low]: readonly [number, number],
  ) => {
    const read = all[all.length - 1]!.middle - line;
    const from = Math.max(at - viewHeight * high, read);
    const to = Math.max(at - viewHeight * low, from + 1);
    const x = Math.min(Math.max((window.scrollY - from) / (to - from), 0), 1);
    return x * x * (3 - 2 * x);
  };
  const remeasure = () => {
    if (!alive) return;
    words.remeasure();
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
    start = storyStart();
    end = storyEnd();
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
    words.dispose();
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

  const theme = watchTheme();
  const motion = watchMotion();
  const tail = comet();
  const sharpness = governor(plan.dpr);

  // The loop: everything eased, nothing read from the layout.
  const t = spring(progress(chapters, window.scrollY, focus()), 0.12);
  let time = 0;
  let still = motion.calm() ? 0 : 1;
  let intro = motion.calm() ? 1 : 0;
  let dark = theme.dark() ? 1 : 0;
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

  let frameAt = performance.now();
  const frames = loop((_, dt) => {
    frameAt = performance.now();
    if (!ready[0]) return;
    const calm = motion.calm();
    still = ease(still, calm ? 0 : 1, 0.5, dt);
    time += dt * still;
    intro = calm ? 1 : Math.min(1, intro + dt / 1.4);
    const darkTarget = theme.dark() ? 1 : 0;
    dark +=
      Math.sign(darkTarget - dark) *
      Math.min(Math.abs(darkTarget - dark), dt / 0.3);
    const at = t.step(progress(chapters, window.scrollY, focus()), dt);
    // The curtain and the edge come in with the scroll: as the story's
    // first words rise from the bottom, or sooner, as the field starts to
    // leave its first shape, so a shape gathers on a clean stage and not
    // over the opening's words.
    const rising =
      start === null ? 0 : (window.scrollY + viewHeight - start) / 160;
    // Past the last Chapter, where a page marks its story's end, the field
    // fades away as the end's first words come up from the bottom, so the
    // last Chapter's words leave as the end's arrive. On a phone the
    // curtain goes after it, once the words it hid have scrolled away, so
    // they never show through.
    const gone = end === null ? 0 : left(chapters, end, focus(), [0.95, 0.6]);
    const lifted = end === null ? 0 : left(chapters, end, focus(), [0.6, 0.4]);
    const drawn = (
      Math.min(1, Math.max(0, rising, at / 0.3)) *
      (1 - lifted)
    ).toFixed(3);
    for (const veil of veils)
      if (veil && veil.style.opacity !== drawn) veil.style.opacity = drawn;
    const visible = (1 - gone).toFixed(3);
    if (stage && stage.style.opacity !== visible) stage.style.opacity = visible;

    const aspect = cssWidth / Math.max(cssHeight, 1);

    // The comet has room to travel only on a wide screen; on a phone's
    // stage it would cross the shape, so there the shape tells it alone.
    tail.step({
      t: at,
      time,
      dt,
      spots,
      aspect,
      on: journey() && cssWidth >= WIDE,
    });

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

    const { a, b, blend, shapes, held } = scene({
      chapters,
      spots,
      t: at,
      time,
      cast,
      ready,
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
      comet: tail.head,
      ribbon: tail.ribbon,
      ribbonCount: tail.ribbonCount,
    });
    // The words, pinned to the shapes by the same transform.
    const [leaving, reaching] = formedOf(blend);
    words.draw({
      shapes: held
        ? [{ name: shapes[0], pose: a, formed: intro }]
        : [
            { name: shapes[0], pose: a, formed: leaving * intro },
            { name: shapes[1], pose: b, formed: reaching * intro },
          ],
      clock: { time, motion: still },
      width: cssWidth,
      height: cssHeight,
      aspect,
      distance: DISTANCE,
      room: cssWidth < WIDE ? room(cssHeight) : undefined,
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
    if (log.on) beat(width, height);
  });

  // With ?debug, a timer the frame loop cannot stop says when frames stop
  // coming while the tab is in view: the browser has stopped animating.
  const watchdog = log.on
    ? window.setInterval(() => {
        const quiet = performance.now() - frameAt;
        if (quiet > 1500 && !document.hidden)
          log.warn(
            `no frame for ${(quiet / 1000).toFixed(1)} s with the tab in view: the browser is not animating this page`,
          );
      }, 2000)
    : 0;

  // With ?debug, every 2 s: how many frames ran, how formed the shape is,
  // and how many pixels this frame really lit, read back before the
  // browser takes the frame, so a field that runs but shows nothing says
  // which failed: the loop, the drawing, or what the browser is handed.
  let beats = 0;
  let beatAt = performance.now();
  const beat = (width: number, height: number) => {
    beats++;
    const now = performance.now();
    if (now - beatAt < 2000) return;
    // The screen's own buffer, whatever the painter left bound.
    const bound = gl.getParameter(
      gl.FRAMEBUFFER_BINDING,
    ) as WebGLFramebuffer | null;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    const pixels = new Uint8Array(width * height * 4);
    gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
    gl.bindFramebuffer(gl.FRAMEBUFFER, bound);
    // Lit: covered, so every browser shows it. Bare: colour with no
    // coverage, which a strict compositor drops; it should stay 0.
    let lit = 0;
    let bare = 0;
    for (let at = 0; at < pixels.length; at += 4) {
      const colour = Math.max(pixels[at]!, pixels[at + 1]!, pixels[at + 2]!);
      const alpha = pixels[at + 3]!;
      if (alpha > 8) lit++;
      if (colour > alpha + 8) bare++;
    }
    log.debug(
      'heartbeat',
      `${Math.round((beats * 1000) / (now - beatAt))} fps`,
      `intro ${intro.toFixed(2)}`,
      `lit ${lit} of ${width * height} pixels`,
      bare > 0 ? `${bare} bare (colour, no alpha)` : 'none bare',
      `canvas opacity ${getComputedStyle(canvas).opacity}`,
      gl.isContextLost() ? 'CONTEXT LOST' : 'context ok',
      document.hidden ? 'tab hidden' : '',
    );
    beats = 0;
    beatAt = now;
  };

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
    window.clearInterval(watchdog);
    stopBaking();
    resizes.disconnect();
    window.removeEventListener('resize', remeasure);
    canvas.removeEventListener('webglcontextlost', lost);
    canvas.removeEventListener('webglcontextrestored', restored);
    theme.dispose();
    motion.dispose();
    paint.dispose();
    words.dispose();
    gl.getExtension('WEBGL_lose_context')?.loseContext();
  };
}
