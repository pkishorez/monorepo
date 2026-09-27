/** A point in the Field, in its CSS pixels. */
export type Point = { readonly x: number; readonly y: number };

/** What the Field shows. Gestures write it; every frame reads it. */
export type FieldState = {
  /** Sideways offset of the dots, px; they wrap. */
  flow: number;
  /** How far the dots lean toward `pullAt`, 0 to 1. */
  pull: number;
  pullAt: Point;
  /** Swirl around `spinAt`, in radians at its centre. */
  spin: number;
  spinAt: Point;
  /** Dot size, 0 to 1. */
  size: number;
  /** Palette offset, in palette colours; wraps. */
  hue: number;
  /** The Anchor of the Chord in progress, mapped onto the Field. */
  anchor: Point | undefined;
};

const SPACING = 28;
const PALETTE = ['--chart-6', '--chart-8', '--chart-9', '--chart-7'];
const PULL_REACH = 220;
const SPIN_REACH = 150;
const RIPPLE_MS = 520;
const BLOOM_MS = 720;
const BLOOM_REACH = 70;
// Share of the way a moved focus point travels each frame.
const FOCUS_EASE = 0.2;

type Rgb = readonly [number, number, number];
type Effect = {
  readonly kind: 'ripple' | 'bloom';
  readonly at: Point;
  readonly start: number;
};

// Canvas takes neither var() nor alpha on a token, so each token is painted
// into one pixel once and read back as sRGB.
const readPalette = (element: HTMLElement): ReadonlyArray<Rgb> => {
  const probe = document.createElement('canvas');
  probe.width = 1;
  probe.height = 1;
  const ctx = probe.getContext('2d', { willReadFrequently: true });
  const style = getComputedStyle(element);
  return PALETTE.map((name) => {
    if (ctx === null) return [255, 255, 255];
    ctx.clearRect(0, 0, 1, 1);
    ctx.fillStyle = style.getPropertyValue(name).trim();
    ctx.fillRect(0, 0, 1, 1);
    const [r = 0, g = 0, b = 0] = ctx.getImageData(0, 0, 1, 1).data;
    return [r, g, b];
  });
};

const rgba = ([r, g, b]: Rgb, alpha: number) =>
  `rgba(${r}, ${g}, ${b}, ${alpha})`;

/** The palette colour at `position`, blending between neighbours; wraps. */
const colorAt = (palette: ReadonlyArray<Rgb>, position: number): Rgb => {
  const n = palette.length;
  const wrapped = ((position % n) + n) % n;
  const index = Math.floor(wrapped);
  const k = wrapped - index;
  const a = palette[index];
  const b = palette[(index + 1) % n];
  return [
    a[0] + (b[0] - a[0]) * k,
    a[1] + (b[1] - a[1]) * k,
    a[2] + (b[2] - a[2]) * k,
  ];
};

/** Moves `current` part of the way to `target`; whether it still has to go. */
const ease = (current: { x: number; y: number }, target: Point) => {
  current.x += (target.x - current.x) * FOCUS_EASE;
  current.y += (target.y - current.y) * FOCUS_EASE;
  if (Math.hypot(target.x - current.x, target.y - current.y) > 0.5) {
    return true;
  }
  current.x = target.x;
  current.y = target.y;
  return false;
};

/**
 * The Field: a grid of softly glowing dots on a canvas, painted one frame
 * at a time and only while something moves. Gestures write `state` and call
 * `invalidate`; `ripple` and `bloom` play at a point unless motion is
 * reduced. Colours are kui chart tokens read from the canvas's element.
 */
export const createField = (
  canvas: HTMLCanvasElement,
  reducedMotion: () => boolean,
) => {
  const state: FieldState = {
    flow: 0,
    pull: 0,
    pullAt: { x: 0, y: 0 },
    spin: 0,
    spinAt: { x: 0, y: 0 },
    size: 0.3,
    hue: 0,
    anchor: undefined,
  };
  // Where the dots are drawn leaning and swirling toward, easing after
  // `pullAt` and `spinAt` so a new focus glides rather than jumps.
  const focus = { pull: { x: 0, y: 0 }, spin: { x: 0, y: 0 } };
  const effects: Array<Effect> = [];
  const palette = readPalette(canvas);
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
    let moving = ease(focus.pull, state.pullAt);
    moving = ease(focus.spin, state.spinAt) || moving;
    while (effects.length > 0) {
      const first = effects[0];
      const life = first.kind === 'ripple' ? RIPPLE_MS : BLOOM_MS;
      if (now - first.start < life) break;
      effects.shift();
    }
    const blooms = effects.filter((effect) => effect.kind === 'bloom');

    ctx.globalCompositeOperation = 'lighter';
    const radius = 1 + state.size * 3.5;
    const shift = ((state.flow % SPACING) + SPACING) % SPACING;
    const columns = Math.ceil(width / SPACING) + 2;
    const rows = Math.ceil(height / SPACING) + 1;
    for (let row = 0; row < rows; row++) {
      for (let column = -1; column < columns; column++) {
        let x = column * SPACING + shift + SPACING / 2;
        let y = row * SPACING + SPACING / 2;
        // The dot's place in the flowing grid, so its colour flows with it.
        const home = column - Math.floor(state.flow / SPACING);
        const tint = colorAt(
          palette,
          ((home * SPACING) / width) * 2 + state.hue,
        );

        const pd = Math.hypot(focus.pull.x - x, focus.pull.y - y);
        const lean = state.pull * 0.5 * Math.exp(-pd / PULL_REACH);
        x += (focus.pull.x - x) * lean;
        y += (focus.pull.y - y) * lean;

        const sd = Math.hypot(x - focus.spin.x, y - focus.spin.y);
        const angle = state.spin * Math.exp(-sd / SPIN_REACH);
        if (angle !== 0) {
          const dx = x - focus.spin.x;
          const dy = y - focus.spin.y;
          x = focus.spin.x + dx * Math.cos(angle) - dy * Math.sin(angle);
          y = focus.spin.y + dx * Math.sin(angle) + dy * Math.cos(angle);
        }

        let swell = 1;
        for (const bloom of blooms) {
          const t = (now - bloom.start) / BLOOM_MS;
          const reach = Math.exp(
            -Math.hypot(x - bloom.at.x, y - bloom.at.y) / BLOOM_REACH,
          );
          swell += 1.6 * reach * Math.min(1, t * 6) * (1 - t) ** 2;
        }
        const r = radius * swell;
        ctx.fillStyle = rgba(tint, 0.16);
        ctx.beginPath();
        ctx.arc(x, y, r * 2.4, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = rgba(tint, 0.85);
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    for (const effect of effects) {
      if (effect.kind !== 'ripple') continue;
      const t = (now - effect.start) / RIPPLE_MS;
      ctx.strokeStyle = rgba(colorAt(palette, state.hue + 1), (1 - t) * 0.8);
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(effect.at.x, effect.at.y, 8 + 64 * t * (2 - t), 0, Math.PI * 2);
      ctx.stroke();
    }

    if (state.anchor !== undefined) {
      const { x, y } = state.anchor;
      const glow = ctx.createRadialGradient(x, y, 0, x, y, 64);
      const color = colorAt(palette, 1);
      glow.addColorStop(0, rgba(color, 0.55));
      glow.addColorStop(1, rgba(color, 0));
      ctx.fillStyle = glow;
      ctx.fillRect(x - 64, y - 64, 128, 128);
    }
    ctx.globalCompositeOperation = 'source-over';

    if (moving || effects.length > 0) invalidate();
  };

  const invalidate = () => {
    if (frame === 0) frame = requestAnimationFrame(draw);
  };

  const play = (kind: Effect['kind'], at: Point) => {
    if (reducedMotion()) return;
    effects.push({ kind, at, start: performance.now() });
    invalidate();
  };

  invalidate();
  return {
    state,
    invalidate,
    ripple: (at: Point) => play('ripple', at),
    bloom: (at: Point) => play('bloom', at),
    destroy: () => cancelAnimationFrame(frame),
  };
};

export type Field = ReturnType<typeof createField>;
