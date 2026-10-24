import type { HandId, HandReading } from '../../shared/gestures/index.ts';
import type { Snapshot } from '../tracker/index.ts';
import {
  CARD,
  DIAL,
  FLASH_LIFE,
  LINE_LIFE,
  RING_LIFE,
  ROWS,
  SLIDES,
  SQUARE,
  TARGETS,
} from './scene.ts';
import type { Scene } from './scene.ts';

/*
 * Draws one frame: the camera, mirrored, then the scene, then each hand's
 * bones and cursor. Everything is in canvas pixels; positions arrive 0 to
 * 1 across the stage and radii as a share of its height.
 */

/** The bones between MediaPipe's 21 points. */
const BONES: ReadonlyArray<readonly [number, number]> = [
  [0, 1],
  [1, 2],
  [2, 3],
  [3, 4],
  [0, 5],
  [5, 6],
  [6, 7],
  [7, 8],
  [5, 9],
  [9, 10],
  [10, 11],
  [11, 12],
  [9, 13],
  [13, 14],
  [14, 15],
  [15, 16],
  [13, 17],
  [17, 18],
  [18, 19],
  [19, 20],
  [0, 17],
];

export const HAND_COLOR: Record<HandId, string> = {
  A: 'oklch(0.72 0.16 240)',
  B: 'oklch(0.76 0.16 60)',
};

const INK = 'oklch(0.98 0 0)';
const DIM = 'oklch(0.98 0 0 / 0.55)';
const PANEL = 'oklch(0.2 0 0 / 0.6)';
const LIT = 'oklch(0.8 0.17 150)';

export function draw(
  ctx: CanvasRenderingContext2D,
  snapshot: Snapshot,
  scene: Scene,
  skeleton: boolean,
) {
  const { width: w, height: h } = ctx.canvas;
  const { reading } = snapshot;
  const at = reading.at;
  const X = (x: number) => x * w;
  const Y = (y: number) => y * h;
  const font = (px: number, weight = 500) =>
    `${weight} ${Math.round(px * h)}px Inter, system-ui, sans-serif`;

  // The camera, mirrored, and dimmed so the drawing stands out.
  ctx.save();
  ctx.translate(w, 0);
  ctx.scale(-1, 1);
  ctx.drawImage(snapshot.video, 0, 0, w, h);
  ctx.restore();
  ctx.fillStyle = 'oklch(0 0 0 / 0.25)';
  ctx.fillRect(0, 0, w, h);

  // A push flashes the whole stage.
  const flash = 1 - (at - scene.flashedAt) / FLASH_LIFE;
  if (flash > 0) {
    ctx.fillStyle = `oklch(1 0 0 / ${0.35 * flash})`;
    ctx.fillRect(0, 0, w, h);
  }

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  // Targets: pinch on one to light it.
  TARGETS.forEach((target, i) => {
    ctx.beginPath();
    ctx.arc(X(target.x), Y(target.y), target.r * h, 0, Math.PI * 2);
    ctx.fillStyle = scene.lit[i] ? LIT : PANEL;
    ctx.fill();
    ctx.lineWidth = 0.004 * h;
    ctx.strokeStyle = DIM;
    ctx.stroke();
    ctx.fillStyle = INK;
    ctx.font = font(0.03, 600);
    ctx.fillText(`${i + 1}`, X(target.x), Y(target.y));
  });

  // The card: pinch on it and move.
  ctx.fillStyle = scene.grab ? HAND_COLOR[scene.grab.hand] : PANEL;
  ctx.strokeStyle = DIM;
  ctx.beginPath();
  ctx.roundRect(
    X(scene.card.x) - (CARD.w * w) / 2,
    Y(scene.card.y) - (CARD.h * h) / 2,
    CARD.w * w,
    CARD.h * h,
    0.015 * h,
  );
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = INK;
  ctx.font = font(0.028, 600);
  ctx.fillText('Drag me', X(scene.card.x), Y(scene.card.y));

  // The square: both hands pinch to zoom and turn it.
  ctx.save();
  ctx.translate(X(SQUARE.x), Y(SQUARE.y));
  ctx.rotate((scene.square.rotation * Math.PI) / 180);
  const side = SQUARE.size * h * scene.square.scale;
  ctx.fillStyle = 'oklch(0.65 0.2 300 / 0.55)';
  ctx.strokeStyle = INK;
  ctx.fillRect(-side / 2, -side / 2, side, side);
  ctx.strokeRect(-side / 2, -side / 2, side, side);
  ctx.fillStyle = INK;
  ctx.font = font(0.022, 600);
  ctx.fillText(`${scene.square.scale.toFixed(2)}×`, 0, 0);
  ctx.restore();

  // The dial: a fist twists it.
  const dx = X(DIAL.x);
  const dy = Y(DIAL.y);
  const dr = DIAL.r * h;
  const start = Math.PI * 0.75;
  const sweep = Math.PI * 1.5;
  ctx.lineCap = 'round';
  ctx.lineWidth = 0.014 * h;
  ctx.strokeStyle = PANEL;
  ctx.beginPath();
  ctx.arc(dx, dy, dr, start, start + sweep);
  ctx.stroke();
  ctx.strokeStyle = LIT;
  ctx.beginPath();
  ctx.arc(dx, dy, dr, start, start + (sweep * scene.dial) / 100);
  ctx.stroke();
  ctx.fillStyle = INK;
  ctx.font = font(0.035, 600);
  ctx.fillText(`${Math.round(scene.dial)}`, dx, dy);
  ctx.font = font(0.02);
  ctx.fillStyle = DIM;
  ctx.fillText('dial', dx, dy + dr * 0.9);

  // Slides along the bottom: swipe left and right.
  const dotY = Y(0.93);
  for (let i = 0; i < SLIDES; i++) {
    ctx.beginPath();
    ctx.arc(
      X(0.5 + (i - (SLIDES - 1) / 2) * 0.03),
      dotY,
      0.009 * h,
      0,
      Math.PI * 2,
    );
    ctx.fillStyle = i === scene.slide ? INK : PANEL;
    ctx.fill();
  }
  ctx.fillStyle = INK;
  ctx.font = font(0.026, 600);
  ctx.fillText(`Slide ${scene.slide + 1} of ${SLIDES}`, X(0.5), Y(0.87));

  // A list down the left: swipe up and down.
  const rowH = 0.045;
  const top = 0.32;
  ctx.textAlign = 'left';
  for (let i = 0; i < ROWS; i++) {
    const y = Y(top + i * rowH);
    const current = i === scene.row;
    ctx.fillStyle = current ? 'oklch(0.98 0 0 / 0.9)' : PANEL;
    ctx.fillRect(X(0.02), y, X(0.13), rowH * h * 0.85);
    ctx.fillStyle = current ? 'oklch(0.2 0 0)' : DIM;
    ctx.font = font(0.022, current ? 600 : 500);
    ctx.fillText(`Row ${i + 1}`, X(0.03), y + (rowH * h * 0.85) / 2);
  }
  ctx.textAlign = 'center';

  // Lines drawn in the air, fading as they age.
  ctx.lineJoin = 'round';
  ctx.lineWidth = 0.008 * h;
  for (const line of scene.lines) {
    for (let i = 1; i < line.points.length; i++) {
      const [a, b] = [line.points[i - 1]!, line.points[i]!];
      ctx.globalAlpha = Math.max(0, 1 - (at - b.at) / LINE_LIFE);
      ctx.strokeStyle = HAND_COLOR[line.hand];
      ctx.beginPath();
      ctx.moveTo(X(a.x), Y(a.y));
      ctx.lineTo(X(b.x), Y(b.y));
      ctx.stroke();
    }
  }
  ctx.globalAlpha = 1;

  // Right-click rings, growing as they fade.
  for (const ring of scene.rings) {
    const t = (at - ring.at) / RING_LIFE;
    ctx.globalAlpha = 1 - t;
    ctx.strokeStyle = INK;
    ctx.lineWidth = 0.006 * h;
    ctx.beginPath();
    ctx.arc(X(ring.x), Y(ring.y), (0.03 + t * 0.06) * h, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;

  for (const hand of reading.hands) drawHand(ctx, hand, skeleton, font);
}

function drawHand(
  ctx: CanvasRenderingContext2D,
  hand: HandReading,
  skeleton: boolean,
  font: (px: number, weight?: number) => string,
) {
  const { width: w, height: h } = ctx.canvas;
  const color = HAND_COLOR[hand.id];
  const at = (i: number) => ({
    x: hand.points[i]!.x * w,
    y: hand.points[i]!.y * h,
  });

  if (skeleton) {
    ctx.strokeStyle = color;
    ctx.lineWidth = 0.005 * h;
    ctx.lineCap = 'round';
    for (const [a, b] of BONES) {
      ctx.beginPath();
      ctx.moveTo(at(a).x, at(a).y);
      ctx.lineTo(at(b).x, at(b).y);
      ctx.stroke();
    }
    ctx.fillStyle = INK;
    hand.points.forEach((_, i) => {
      ctx.beginPath();
      ctx.arc(at(i).x, at(i).y, 0.006 * h, 0, Math.PI * 2);
      ctx.fill();
    });
  }

  // The cursor: filled while pinched, with the hand's letter and count.
  const cx = hand.cursor.x * w;
  const cy = hand.cursor.y * h;
  const r = 0.025 * h;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.lineWidth = 0.006 * h;
  ctx.strokeStyle = color;
  ctx.fillStyle = hand.pinch.down ? color : 'oklch(0 0 0 / 0.35)';
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = INK;
  ctx.font = font(0.024, 700);
  ctx.fillText(hand.id, cx, cy);

  // A tag by the wrist: the count, and the model's shape when it names one.
  const wrist = at(0);
  const label =
    hand.shape.name !== 'None'
      ? `${hand.count} · ${hand.shape.name}`
      : `${hand.count}`;
  ctx.font = font(0.024, 600);
  const pad = 0.01 * h;
  const tw = ctx.measureText(label).width + pad * 2;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.roundRect(wrist.x - tw / 2, wrist.y + 0.02 * h, tw, 0.04 * h, 0.01 * h);
  ctx.fill();
  ctx.fillStyle = 'oklch(0.15 0 0)';
  ctx.fillText(label, wrist.x, wrist.y + 0.04 * h);
}
