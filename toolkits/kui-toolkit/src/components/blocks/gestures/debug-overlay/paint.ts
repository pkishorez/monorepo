import type { EdgeStrips, Rect } from '../zone';
import type { Trail } from './trails';

export type Palette = {
  readonly zone: string;
  readonly edge: string;
  readonly pointer: string;
  readonly text: string;
};

type Scene = {
  readonly zone:
    | { readonly rect: Rect; readonly strips: EdgeStrips }
    | undefined;
  readonly trails: ReadonlyArray<Trail>;
  readonly palette: Palette;
};

const FINGER_RADIUS = 16;

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

const label = (
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  rotate: number,
) => {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rotate);
  ctx.fillText(text, 0, 0);
  ctx.restore();
};

const paintZone = (
  ctx: CanvasRenderingContext2D,
  zone: NonNullable<Scene['zone']>,
  palette: Palette,
  win: Window,
) => {
  const top = Math.max(zone.rect.top, 0);
  const bottom = Math.min(zone.rect.bottom, win.innerHeight);
  if (bottom <= top) return;
  const width = win.innerWidth;
  const { left, right } = zone.strips;

  ctx.fillStyle = palette.zone;
  ctx.globalAlpha = 0.05;
  ctx.fillRect(
    zone.rect.left,
    top,
    zone.rect.right - zone.rect.left,
    bottom - top,
  );
  ctx.globalAlpha = 0.6;
  ctx.strokeStyle = palette.zone;
  ctx.lineWidth = 1.5;
  ctx.setLineDash([6, 4]);
  ctx.strokeRect(
    zone.rect.left + 0.75,
    top + 0.75,
    zone.rect.right - zone.rect.left - 1.5,
    bottom - top - 1.5,
  );
  ctx.setLineDash([]);

  ctx.fillStyle = palette.edge;
  ctx.globalAlpha = 0.16;
  ctx.fillRect(0, top, left.width, bottom - top);
  ctx.fillRect(width - right.width, top, right.width, bottom - top);

  ctx.font = '600 10px ui-monospace, SFMono-Regular, Menlo, monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  if (bottom - top > 120) {
    const middle = (top + bottom) / 2;
    ctx.globalAlpha = 0.95;
    label(
      ctx,
      `${left.owner.toUpperCase()} · ${left.width}PX`,
      left.width / 2,
      middle,
      -Math.PI / 2,
    );
    label(
      ctx,
      `${right.owner.toUpperCase()} · ${right.width}PX`,
      width - right.width / 2,
      middle,
      Math.PI / 2,
    );
  }
  ctx.fillStyle = palette.zone;
  ctx.globalAlpha = 0.9;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillText('GESTURE ZONE · APP', zone.rect.left + 8, top + 8);
  ctx.globalAlpha = 1;
};

const paintTrail = (
  ctx: CanvasRenderingContext2D,
  trail: Trail,
  palette: Palette,
) => {
  const head = trail.points.at(-1);
  if (head === undefined) return;
  ctx.strokeStyle = palette.pointer;
  ctx.lineWidth = 3;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  // Older segments fade, so the trail reads as direction and speed.
  for (let i = 1; i < trail.points.length; i++) {
    const from = trail.points[i - 1];
    const to = trail.points[i];
    ctx.globalAlpha = (i / trail.points.length) * 0.7 * trail.opacity;
    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(to.x, to.y);
    ctx.stroke();
  }
  ctx.globalAlpha = 0.22 * trail.opacity;
  ctx.fillStyle = palette.pointer;
  ctx.beginPath();
  ctx.arc(head.x, head.y, FINGER_RADIUS, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = trail.opacity;
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.fillStyle = palette.text;
  ctx.font = '600 11px ui-monospace, SFMono-Regular, Menlo, monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(String(trail.id), head.x, head.y);
  ctx.globalAlpha = 1;
};

/** Draws one frame: the zone and its edge strips, then every pointer and its trail. */
export const paint = (canvas: HTMLCanvasElement, scene: Scene) => {
  const win = canvas.ownerDocument.defaultView ?? window;
  const ctx = canvas.getContext('2d');
  if (ctx === null) return;
  const dpr = fitToViewport(canvas, win);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, win.innerWidth, win.innerHeight);
  if (scene.zone !== undefined) paintZone(ctx, scene.zone, scene.palette, win);
  for (const trail of scene.trails) paintTrail(ctx, trail, scene.palette);
};
