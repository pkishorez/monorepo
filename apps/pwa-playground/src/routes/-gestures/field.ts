/** A point in the Field, in its CSS pixels. */
export type Point = { readonly x: number; readonly y: number };

/**
 * What the Field shows. Gestures write it; every frame reads it. The grid
 * lives in world units, one dot every {@link SPACING}; the view places it:
 * a Field point is `world × scale + offset`.
 */
export type FieldState = {
  view: { x: number; y: number; scale: number };
  /** Pins dropped on the grid, in world units. */
  pins: Array<Point>;
  /** The locked Anchor, mapped onto the Field. */
  anchor: { readonly at: Point; readonly side: 'left' | 'right' } | undefined;
};

export const SPACING = 28;
const DOT_RADIUS = 2.2;
const PIN_RADIUS = 5;
const LIT_MS = 1200;
const LIT_REACH = 3;

type Rgb = readonly [number, number, number];
type Lit = { readonly at: Point; readonly start: number };

// Canvas takes neither var() nor alpha on a token, so each token is painted
// into one pixel once and read back as sRGB.
const readColors = <K extends string>(
  element: HTMLElement,
  tokens: Record<K, string>,
): Record<K, Rgb> => {
  const probe = document.createElement('canvas');
  probe.width = 1;
  probe.height = 1;
  const ctx = probe.getContext('2d', { willReadFrequently: true });
  const style = getComputedStyle(element);
  const out = {} as Record<K, Rgb>;
  for (const key of Object.keys(tokens) as Array<K>) {
    if (ctx === null) {
      out[key] = [255, 255, 255];
      continue;
    }
    ctx.clearRect(0, 0, 1, 1);
    ctx.fillStyle = style.getPropertyValue(tokens[key]).trim();
    ctx.fillRect(0, 0, 1, 1);
    const [r = 0, g = 0, b = 0] = ctx.getImageData(0, 0, 1, 1).data;
    out[key] = [r, g, b];
  }
  return out;
};

const rgba = ([r, g, b]: Rgb, alpha: number) =>
  `rgba(${r}, ${g}, ${b}, ${alpha})`;

/** The Field point a world point is drawn at. */
export const toScreen = (state: FieldState, world: Point): Point => ({
  x: world.x * state.view.scale + state.view.x,
  y: world.y * state.view.scale + state.view.y,
});

/** The world point under a Field point. */
export const toWorld = (state: FieldState, at: Point): Point => ({
  x: (at.x - state.view.x) / state.view.scale,
  y: (at.y - state.view.y) / state.view.scale,
});

/**
 * The Field: a grid of dots on a canvas, painted one frame at a time and
 * only while something changes. Gestures write `state` and call
 * `invalidate`; `light` makes the dot nearest a point glow and fade, or
 * just glow for a while when motion is reduced. Colours are kui tokens read
 * from the canvas's element.
 */
export const createField = (
  canvas: HTMLCanvasElement,
  reducedMotion: () => boolean,
) => {
  const state: FieldState = {
    view: { x: 0, y: 0, scale: 1 },
    pins: [],
    anchor: undefined,
  };
  const lit: Array<Lit> = [];
  const colors = readColors(canvas, {
    dot: '--muted-foreground',
    lit: '--chart-9',
    pin: '--chart-7',
    anchor: '--chart-8',
  });
  let frame = 0;

  const draw = () => {
    frame = 0;
    const ctx = canvas.getContext('2d');
    if (ctx === null) return;
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    const dpr = window.devicePixelRatio || 1;
    if (canvas.width !== Math.round(width * dpr)) {
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);
    const now = performance.now();
    while (lit.length > 0 && now - lit[0].start >= LIT_MS) lit.shift();

    const { scale } = state.view;
    const step = SPACING * scale;
    const radius = DOT_RADIUS * scale;
    const first = toWorld(state, { x: 0, y: 0 });
    const last = toWorld(state, { x: width, y: height });
    ctx.fillStyle = rgba(colors.dot, 0.55);
    ctx.beginPath();
    for (
      let i = Math.floor(first.x / SPACING);
      i <= Math.ceil(last.x / SPACING);
      i++
    ) {
      for (
        let j = Math.floor(first.y / SPACING);
        j <= Math.ceil(last.y / SPACING);
        j++
      ) {
        const at = toScreen(state, { x: i * SPACING, y: j * SPACING });
        ctx.moveTo(at.x + radius, at.y);
        ctx.arc(at.x, at.y, radius, 0, Math.PI * 2);
      }
    }
    ctx.fill();

    for (const dot of lit) {
      const t = reducedMotion() ? 0 : (now - dot.start) / LIT_MS;
      const at = toScreen(state, dot.at);
      const glow = ctx.createRadialGradient(
        at.x,
        at.y,
        0,
        at.x,
        at.y,
        step * LIT_REACH,
      );
      glow.addColorStop(0, rgba(colors.lit, 0.5 * (1 - t)));
      glow.addColorStop(1, rgba(colors.lit, 0));
      ctx.fillStyle = glow;
      ctx.fillRect(
        at.x - step * LIT_REACH,
        at.y - step * LIT_REACH,
        step * LIT_REACH * 2,
        step * LIT_REACH * 2,
      );
      ctx.fillStyle = rgba(colors.lit, 1 - t * 0.6);
      ctx.beginPath();
      ctx.arc(at.x, at.y, radius * 2.2, 0, Math.PI * 2);
      ctx.fill();
    }

    for (const pin of state.pins) {
      const at = toScreen(state, pin);
      ctx.strokeStyle = rgba(colors.pin, 0.9);
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(at.x, at.y);
      ctx.lineTo(at.x, at.y - PIN_RADIUS * 2.4);
      ctx.stroke();
      ctx.fillStyle = rgba(colors.pin, 1);
      ctx.beginPath();
      ctx.arc(at.x, at.y - PIN_RADIUS * 2.4, PIN_RADIUS, 0, Math.PI * 2);
      ctx.fill();
    }

    if (state.anchor !== undefined) {
      const { x, y } = state.anchor.at;
      ctx.strokeStyle = rgba(colors.anchor, 0.8);
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.arc(x, y, 18, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = rgba(colors.anchor, 0.8);
      ctx.beginPath();
      ctx.arc(x, y, 3, 0, Math.PI * 2);
      ctx.fill();
    }

    if (lit.length > 0) invalidate();
  };

  const invalidate = () => {
    if (frame === 0) frame = requestAnimationFrame(draw);
  };

  invalidate();
  return {
    state,
    invalidate,
    /** Lights the dot nearest a Field point. */
    light: (at: Point) => {
      const world = toWorld(state, at);
      lit.push({
        at: {
          x: Math.round(world.x / SPACING) * SPACING,
          y: Math.round(world.y / SPACING) * SPACING,
        },
        start: performance.now(),
      });
      invalidate();
    },
    destroy: () => cancelAnimationFrame(frame),
  };
};

export type Field = ReturnType<typeof createField>;
