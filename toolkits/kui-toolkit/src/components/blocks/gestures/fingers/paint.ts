import type { Anchor, TapMark } from '../engine';
import type { Frame, Painter, ZoneSource } from '../layer';
import type { Rect } from '../zone';
import { createTrails, type Trail } from './trails';

const RING_RADIUS = 22;
const HEAD_RADIUS = 9;
const PULSE_MS = 1600;
// A finger at rest grows a bubble under it after REST_DELAY_MS, over
// REST_GROW_MS, so a quick tap or a scroll never shows it; moving shrinks it
// away in BUBBLE_EXIT_MS. It only shows the finger is still; it decides nothing.
const REST_DELAY_MS = 120;
const REST_GROW_MS = 280;
const BUBBLE_EXIT_MS = 120;
// The pop when an Anchor locks: an overshoot back to size, and a flash ring.
const POP_MS = 320;
const FLASH_MS = 360;
// How long the spotlight takes to come up when an Anchor locks, and to go.
const SPOTLIGHT_MS = 160;
// A ring bursting out from a tap; a double tap bursts twice.
const BURST_MS = 360;
const BURST_GAP_MS = 90;
// Path kept behind the acting finger: a comet, or a stub for reduced motion.
const TAIL_MS = 240;
const STILL_TAIL_MS = 60;
// Around the Anchor: lit up to LIT_PX, clear to CLEAR_PX, dimmed past DIM_PX.
const LIT_PX = 44;
const CLEAR_PX = 72;
const DIM_PX = 150;
const CHIP_HEIGHT = 24;
const CHIP_INSET = 8;

type Point = { readonly x: number; readonly y: number };

const head = (trail: Trail): Point => trail.points.at(-1) ?? trail.down;
const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

// Strong ease-out with an overshoot, for the lock's pop.
const backOut = (t: number) => {
  const c = 1.70158;
  return 1 + (c + 1) * (t - 1) ** 3 + c * (t - 1) ** 2;
};
const easeOut = (t: number) => 1 - (1 - t) ** 3;

/** A finger down and undecided: a soft ring, and the resting bubble inside it. */
const paintRing = ({ ctx, color }: Frame, trail: Trail, bubble: number) => {
  const at = head(trail);
  if (bubble > 0) {
    ctx.beginPath();
    ctx.arc(at.x, at.y, RING_RADIUS * (0.55 + 0.45 * bubble), 0, Math.PI * 2);
    ctx.fillStyle = color('--gf-anchor', 0.22 * bubble * trail.opacity);
    ctx.fill();
  }
  ctx.beginPath();
  ctx.arc(at.x, at.y, RING_RADIUS, 0, Math.PI * 2);
  ctx.fillStyle = color('--gf-ring', 0.06 * trail.opacity);
  ctx.fill();
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = color('--gf-ring', 0.35 * trail.opacity);
  ctx.stroke();
};

/**
 * Dims the zone around the Anchor and lights the area under it, so the
 * locked finger reads as the centre of attention. `k` fades it in and out.
 */
const paintSpotlight = (
  { ctx, color }: Frame,
  zone: Rect,
  at: Point,
  k: number,
) => {
  const reach = Math.max(
    DIM_PX + 1,
    Math.hypot(zone.right - zone.left, zone.bottom - zone.top),
  );
  const light = ctx.createRadialGradient(at.x, at.y, 0, at.x, at.y, reach);
  light.addColorStop(0, color('--gf-anchor', 0.3 * k));
  light.addColorStop(LIT_PX / reach, color('--gf-anchor', 0.1 * k));
  light.addColorStop(CLEAR_PX / reach, color('--gf-dim', 0));
  light.addColorStop(DIM_PX / reach, color('--gf-dim', 0.45 * k));
  light.addColorStop(1, color('--gf-dim', 0.6 * k));
  ctx.fillStyle = light;
  ctx.fillRect(
    zone.left,
    zone.top,
    zone.right - zone.left,
    zone.bottom - zone.top,
  );
};

/**
 * The Anchor: a strong glow and ring, which pop in with an overshoot and a
 * flash when it locks, then pulse slowly. Reduced motion keeps it still.
 */
const paintAnchor = (
  { ctx, color, now }: Frame,
  anchor: Trail,
  lockedAt: number,
  reducedMotion: boolean,
) => {
  const at = head(anchor);
  const alpha = anchor.opacity;
  const since = now - lockedAt;
  const scale = reducedMotion
    ? 1
    : 0.6 + 0.4 * backOut(clamp01(since / POP_MS));
  const radius = RING_RADIUS * scale;
  const glow = ctx.createRadialGradient(at.x, at.y, 0, at.x, at.y, radius * 2);
  glow.addColorStop(0, color('--gf-anchor', 0.6 * alpha));
  glow.addColorStop(1, color('--gf-anchor', 0));
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(at.x, at.y, radius * 2, 0, Math.PI * 2);
  ctx.fill();

  ctx.lineWidth = 2.5;
  ctx.strokeStyle = color('--gf-anchor', 0.95 * alpha);
  ctx.beginPath();
  ctx.arc(at.x, at.y, radius, 0, Math.PI * 2);
  ctx.stroke();
  if (reducedMotion) return;
  if (since < FLASH_MS) {
    const t = easeOut(since / FLASH_MS);
    ctx.lineWidth = 3 * (1 - t);
    ctx.strokeStyle = color('--gf-anchor', (1 - t) * 0.8 * alpha);
    ctx.beginPath();
    ctx.arc(at.x, at.y, RING_RADIUS * (1 + 1.4 * t), 0, Math.PI * 2);
    ctx.stroke();
    return;
  }
  const phase = ((since - FLASH_MS) % PULSE_MS) / PULSE_MS;
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = color('--gf-anchor', (1 - phase) * 0.5 * alpha);
  ctx.beginPath();
  ctx.arc(at.x, at.y, RING_RADIUS + phase * RING_RADIUS, 0, Math.PI * 2);
  ctx.stroke();
};

/**
 * A chip beside the Anchor saying which finger is locked, kept inside the
 * zone: above the finger, or below it when above would leave the zone.
 */
const paintLockChip = (
  { ctx, color, font }: Frame,
  anchor: Trail,
  side: Anchor['side'],
  zone: Rect,
) => {
  const at = head(anchor);
  const text = `${side === 'left' ? 'Left' : 'Right'} finger locked`;
  ctx.font = `600 12px ${font}`;
  const w = ctx.measureText(text).width + 20;
  const x = Math.min(
    Math.max(at.x - w / 2, zone.left + CHIP_INSET),
    zone.right - w - CHIP_INSET,
  );
  const above = at.y - RING_RADIUS * 2 - CHIP_HEIGHT;
  const y =
    above < zone.top + CHIP_INSET
      ? Math.min(at.y + RING_RADIUS * 2, zone.bottom - CHIP_HEIGHT - CHIP_INSET)
      : above;
  ctx.globalAlpha = anchor.opacity;
  ctx.fillStyle = color('--gf-chip', 0.94);
  ctx.beginPath();
  ctx.roundRect(x, y, w, CHIP_HEIGHT, CHIP_HEIGHT / 2);
  ctx.fill();
  ctx.fillStyle = color('--gf-chip-text');
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, x + w / 2, y + CHIP_HEIGHT / 2);
  ctx.globalAlpha = 1;
};

/**
 * The acting finger as a comet: a ribbon that tapers and fades toward its
 * tail. The tail keeps a fixed stretch of time, so it grows longer with
 * speed; it also brightens with speed, unless motion is reduced.
 */
const paintComet = (
  { ctx, color }: Frame,
  trail: Trail,
  reducedMotion: boolean,
) => {
  const { points } = trail;
  const tip = head(trail);
  const first = points[0];
  const span = first === undefined ? 0 : (points.at(-1)?.t ?? 0) - first.t;
  const speed =
    first === undefined || span <= 0
      ? 0
      : Math.hypot(tip.x - first.x, tip.y - first.y) / span;
  const brightness = reducedMotion ? 0.7 : Math.min(1, 0.4 + speed / 2);
  const alpha = brightness * trail.opacity;
  ctx.lineCap = 'round';
  for (let i = 1; i < points.length; i++) {
    const k = i / (points.length - 1);
    ctx.lineWidth = 1 + k * (HEAD_RADIUS * 2 - 1);
    ctx.strokeStyle = color('--gf-acting', k * k * 0.8 * alpha);
    ctx.beginPath();
    ctx.moveTo(points[i - 1].x, points[i - 1].y);
    ctx.lineTo(points[i].x, points[i].y);
    ctx.stroke();
  }
  const glow = ctx.createRadialGradient(
    tip.x,
    tip.y,
    0,
    tip.x,
    tip.y,
    RING_RADIUS * 1.6,
  );
  glow.addColorStop(0, color('--gf-acting', 0.5 * alpha));
  glow.addColorStop(1, color('--gf-acting', 0));
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(tip.x, tip.y, RING_RADIUS * 1.6, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = color('--gf-acting', 0.95 * trail.opacity);
  ctx.beginPath();
  ctx.arc(tip.x, tip.y, HEAD_RADIUS, 0, Math.PI * 2);
  ctx.fill();
};

/**
 * A ring bursting from a tap, twice for a double tap. Reduced motion keeps
 * the ring in place and only fades it. Returns whether it is still going.
 */
const paintBurst = (
  { ctx, color, now }: Frame,
  tap: TapMark,
  at: number,
  reducedMotion: boolean,
): boolean => {
  const rings = tap.kind === 'double-tap' ? 2 : 1;
  let going = false;
  for (let ring = 0; ring < rings; ring++) {
    const t = (now - at - ring * BURST_GAP_MS) / BURST_MS;
    if (t >= 1) continue;
    going = true;
    if (t < 0) continue;
    const grow = reducedMotion ? 0.6 : easeOut(t);
    ctx.lineWidth = 2;
    ctx.strokeStyle = color('--gf-acting', (1 - t) * 0.9);
    ctx.beginPath();
    ctx.arc(tap.x, tap.y, HEAD_RADIUS + RING_RADIUS * grow, 0, Math.PI * 2);
    ctx.stroke();
  }
  return going;
};

/**
 * Paints every finger in the zone by its role: a soft ring, with a bubble
 * growing inside while it rests, for a finger not yet decided or in no
 * gesture; the locked Anchor with the zone dimmed around it and a chip
 * naming it; a comet for a panning finger; a burst for each tap. Asks for
 * frames while a finger is down or anything is fading.
 */
export const createFingerPainter = (source: ZoneSource): Painter => {
  const trails = createTrails();
  const spotlight = { k: 0, at: { x: 0, y: 0 }, t: 0 };
  const bubbles = new Map<number, number>();
  // When each Anchor locked and on which side, kept while it fades.
  const locks = new Map<number, { at: number; side: Anchor['side'] }>();
  let burst: { tap: TapMark; at: number } | undefined;
  let lastFrame = 0;

  return (frame) => {
    const reduced = source.environment().reducedMotion;
    const inspection = source.inspect();
    const dt = frame.now - lastFrame;
    lastFrame = frame.now;
    trails.record(inspection?.fingers ?? [], frame.now);
    const visible = trails.visible(
      frame.now,
      reduced ? STILL_TAIL_MS : TAIL_MS,
    );
    const anchor = visible.find((trail) => trail.role === 'anchor');

    const tap = inspection?.tap;
    if (tap !== undefined && tap.count !== burst?.tap.count) {
      burst = { tap, at: frame.now };
    }

    const target = anchor === undefined ? 0 : anchor.opacity;
    const step = reduced ? 1 : (frame.now - spotlight.t) / SPOTLIGHT_MS;
    spotlight.k =
      target > spotlight.k
        ? Math.min(target, spotlight.k + step)
        : Math.max(target, spotlight.k - step);
    spotlight.t = frame.now;
    if (anchor !== undefined) spotlight.at = head(anchor);
    // The whole element dims, edge strips included, so the zone reads as one surface.
    const measured = source.measure();
    if (spotlight.k > 0 && measured !== undefined) {
      paintSpotlight(frame, measured.bounds, spotlight.at, spotlight.k);
    }

    let bubbling = false;
    for (const trail of visible) {
      const rest = frame.now - (trail.points.at(-1)?.t ?? frame.now);
      const growing =
        trail.role === 'pending' && trail.opacity === 1
          ? clamp01((rest - REST_DELAY_MS) / REST_GROW_MS)
          : 0;
      const shown = reduced && growing > 0 ? 1 : growing;
      const before = bubbles.get(trail.id) ?? 0;
      const bubble =
        shown >= before
          ? shown
          : reduced
            ? 0
            : Math.max(shown, before - dt / BUBBLE_EXIT_MS);
      bubbles.set(trail.id, bubble);
      bubbling ||= bubble > 0;

      if (trail.role === 'anchor') {
        const side = inspection?.anchor?.side;
        if (!locks.has(trail.id) && side !== undefined) {
          locks.set(trail.id, { at: frame.now, side });
        }
      } else if (trail.role === 'acting') {
        paintComet(frame, trail, reduced);
      } else {
        paintRing(frame, trail, bubble);
      }
    }
    for (const id of bubbles.keys()) {
      if (!visible.some((trail) => trail.id === id)) bubbles.delete(id);
    }
    for (const id of locks.keys()) {
      if (
        !visible.some((trail) => trail.id === id && trail.role === 'anchor')
      ) {
        locks.delete(id);
      }
    }

    const lock = anchor === undefined ? undefined : locks.get(anchor.id);
    if (anchor !== undefined && lock !== undefined) {
      paintAnchor(frame, anchor, lock.at, reduced);
      if (measured !== undefined) {
        paintLockChip(frame, anchor, lock.side, measured.rect);
      }
    }
    const bursting =
      burst !== undefined && paintBurst(frame, burst.tap, burst.at, reduced);

    return trails.animating() || spotlight.k > 0 || bubbling || bursting;
  };
};
