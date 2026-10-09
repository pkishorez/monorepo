/*
 * How the field looks: a dark sky with drifting nebula glows, glowing
 * trails, and a vignette. Pure painting on a 2D context; it knows nothing
 * about how particles move.
 */

type Context = CanvasRenderingContext2D;
type Point = { readonly x: number; readonly y: number };

const FADE_IN = 350;
const FADE_OUT = 900;

/** How visible a particle is at `age` of its `lifespan`: it fades in and out. */
export const fadeAt = (age: number, lifespan: number) =>
  Math.max(0, Math.min(1, age / FADE_IN, (lifespan - age) / FADE_OUT));

const NEBULAE = [
  {
    speed: 0.11,
    x: 0.3,
    y: 0.4,
    dx: 80,
    dy: 50,
    color: 'rgba(120, 35, 200, 0.18)',
  },
  {
    speed: 0.07,
    x: 0.72,
    y: 0.62,
    dx: 100,
    dy: 60,
    color: 'rgba(28, 90, 200, 0.16)',
  },
  {
    speed: 0.13,
    x: 0.52,
    y: 0.28,
    dx: 60,
    dy: 80,
    color: 'rgba(220, 30, 140, 0.13)',
  },
];

export const paintSky = (
  context: Context,
  width: number,
  height: number,
  seconds: number,
) => {
  context.fillStyle = '#04030a';
  context.fillRect(0, 0, width, height);
  NEBULAE.forEach((nebula, index) => {
    const phase = (index / NEBULAE.length) * Math.PI * 2;
    context.beginPath();
    context.arc(
      width * nebula.x + Math.sin(seconds * nebula.speed + phase) * nebula.dx,
      height * nebula.y + Math.cos(seconds * nebula.speed + phase) * nebula.dy,
      280,
      0,
      Math.PI * 2,
    );
    context.fillStyle = nebula.color;
    context.fill();
  });
};

/** A trail in `hue`, `fade` visible: a wide faint glow, a thin core, a bright head. */
export const paintTrail = (
  context: Context,
  trail: ReadonlyArray<Point>,
  hue: number,
  fade: number,
) => {
  if (trail.length < 2 || fade < 0.01) return;
  context.beginPath();
  trail.forEach(({ x, y }, index) =>
    index === 0 ? context.moveTo(x, y) : context.lineTo(x, y),
  );
  context.lineCap = 'round';
  context.lineJoin = 'round';
  context.strokeStyle = `hsla(${hue}, 90%, 60%, ${0.18 * fade})`;
  context.lineWidth = 5;
  context.stroke();
  context.strokeStyle = `hsla(${hue}, 90%, 78%, ${0.85 * fade})`;
  context.lineWidth = 1.4;
  context.stroke();
  const head = trail[trail.length - 1]!;
  context.beginPath();
  context.arc(head.x, head.y, 2.4, 0, Math.PI * 2);
  context.fillStyle = `hsla(${hue}, 90%, 92%, ${0.95 * fade})`;
  context.fill();
};

export const paintVignette = (
  context: Context,
  width: number,
  height: number,
) => {
  context.fillStyle = 'rgba(2, 1, 8, 0.1375)';
  for (let step = 0; step < 4; step++) {
    const strip = 80 * (1 - step / 4);
    context.fillRect(0, 0, width, strip);
    context.fillRect(0, height - strip, width, strip);
    context.fillRect(0, 0, strip, height);
    context.fillRect(width - strip, 0, strip, height);
  }
};

export const paintPointer = (
  context: Context,
  pointer: Point | null,
  radius: number,
) => {
  if (!pointer) return;
  context.beginPath();
  context.arc(pointer.x, pointer.y, radius, 0, Math.PI * 2);
  context.fillStyle = 'rgba(255, 255, 255, 0.04)';
  context.fill();
};
