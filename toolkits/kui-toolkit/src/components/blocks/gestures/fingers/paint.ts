import type { Frame, Painter, ZoneSource } from '../layer';
import type { Rect } from '../zone';
import { createTrails, type Trail } from './trails';

const RING_RADIUS = 22;
const HEAD_RADIUS = 9;
const PULSE_MS = 1600;
// How long the spotlight takes to come up when an Anchor locks, and to go.
const SPOTLIGHT_MS = 160;
// Path kept behind the acting finger: a comet, or a stub for reduced motion.
const TAIL_MS = 240;
const STILL_TAIL_MS = 60;
// Around the Anchor: lit up to LIT_PX, clear to CLEAR_PX, dimmed past DIM_PX.
const LIT_PX = 44;
const CLEAR_PX = 72;
const DIM_PX = 150;

type Point = { readonly x: number; readonly y: number };

const head = (trail: Trail): Point => trail.points.at(-1) ?? trail.down;

/** A finger that is down but not locked or followed: a soft ring. */
const paintRing = ({ ctx, color }: Frame, trail: Trail) => {
  const at = head(trail);
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

/** The Anchor: a strong glow and, unless motion is reduced, a slow pulse ring. */
const paintAnchor = (
  { ctx, color, now }: Frame,
  anchor: Trail,
  reducedMotion: boolean,
) => {
  const at = head(anchor);
  const alpha = anchor.opacity;
  const glow = ctx.createRadialGradient(
    at.x,
    at.y,
    0,
    at.x,
    at.y,
    RING_RADIUS * 2,
  );
  glow.addColorStop(0, color('--gf-anchor', 0.6 * alpha));
  glow.addColorStop(1, color('--gf-anchor', 0));
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(at.x, at.y, RING_RADIUS * 2, 0, Math.PI * 2);
  ctx.fill();

  ctx.lineWidth = 2.5;
  ctx.strokeStyle = color('--gf-anchor', 0.95 * alpha);
  ctx.beginPath();
  ctx.arc(at.x, at.y, RING_RADIUS, 0, Math.PI * 2);
  ctx.stroke();
  if (reducedMotion) return;
  const phase = (now % PULSE_MS) / PULSE_MS;
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = color('--gf-anchor', (1 - phase) * 0.5 * alpha);
  ctx.beginPath();
  ctx.arc(at.x, at.y, RING_RADIUS + phase * RING_RADIUS, 0, Math.PI * 2);
  ctx.stroke();
};

/** A small chip beside the Anchor saying which finger is locked. */
const paintLockChip = (
  { ctx, color, font, width }: Frame,
  anchor: Trail,
  side: 'Left' | 'Right',
) => {
  const at = head(anchor);
  const text = `${side} finger locked`;
  ctx.font = `600 12px ${font}`;
  const w = ctx.measureText(text).width + 20;
  const h = 24;
  const x = Math.min(Math.max(at.x - w / 2, 8), width - w - 8);
  const above = at.y - RING_RADIUS * 2 - h;
  const y = above < 8 ? at.y + RING_RADIUS * 2 : above;
  ctx.globalAlpha = anchor.opacity;
  ctx.fillStyle = color('--gf-chip', 0.94);
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, h / 2);
  ctx.fill();
  ctx.fillStyle = color('--gf-chip-text');
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, x + w / 2, y + h / 2);
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
 * Paints every finger in the zone by its role: soft rings for fingers not
 * yet decided or in no gesture, a locked Anchor with the zone dimmed around
 * it, and a comet for the acting finger. Asks for frames while a finger is
 * down or fading.
 */
export const createFingerPainter = (source: ZoneSource): Painter => {
  const trails = createTrails();
  const spotlight = { k: 0, at: { x: 0, y: 0 }, t: 0 };
  return (frame) => {
    const reduced = source.environment().reducedMotion;
    trails.record(source.inspect()?.fingers ?? [], frame.now);
    const visible = trails.visible(
      frame.now,
      reduced ? STILL_TAIL_MS : TAIL_MS,
    );
    const anchor = visible.find((trail) => trail.role === 'anchor');
    const acting = visible.find((trail) => trail.role === 'acting');

    const target = anchor === undefined ? 0 : anchor.opacity;
    const step = reduced ? 1 : (frame.now - spotlight.t) / SPOTLIGHT_MS;
    spotlight.k =
      target > spotlight.k
        ? Math.min(target, spotlight.k + step)
        : Math.max(target, spotlight.k - step);
    spotlight.t = frame.now;
    if (anchor !== undefined) spotlight.at = head(anchor);
    // The whole element dims, edge strips included, so the zone reads as one surface.
    const zone = source.measure()?.bounds;
    if (spotlight.k > 0 && zone !== undefined) {
      paintSpotlight(frame, zone, spotlight.at, spotlight.k);
    }

    for (const trail of visible) {
      if (trail.role === 'acting') paintComet(frame, trail, reduced);
      else if (trail.role !== 'anchor') paintRing(frame, trail);
    }
    if (anchor !== undefined) {
      paintAnchor(frame, anchor, reduced);
      if (acting !== undefined) {
        paintLockChip(
          frame,
          anchor,
          anchor.down.x < acting.down.x ? 'Left' : 'Right',
        );
      }
    }
    return trails.animating() || spotlight.k > 0;
  };
};
