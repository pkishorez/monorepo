import type { Frame } from 'laymos/story/schema';

interface Point {
  readonly x: number;
  readonly y: number;
}

/** Where the pointer or finger is, as waypoints on the Story clock. */
export type Path = readonly (Point & { readonly at: number })[];

export interface Scene {
  readonly kind: 'desktop' | 'mobile';
  readonly title: string;
  /** Item labels with the moment each appears. */
  readonly items: readonly { readonly label: string; readonly at: number }[];
  readonly typed?: {
    readonly text: string;
    readonly from: number;
    readonly to: number;
  };
  readonly pointer?: Path;
  /** While set, the pointer draws as a pressed finger or click ripple. */
  readonly pressedDuring?: readonly (readonly [number, number])[];
  /** An item sliding out, as an offset over time. */
  readonly swipe?: {
    readonly item: number;
    readonly from: number;
    readonly to: number;
  };
}

/** Frames at uneven times, as a screencast delivers them: dense while things move. */
export function recordFrames(
  scene: Scene,
  openedAt: number,
  closedAt: number,
  prefix: string,
  files: Map<string, string>,
): Frame[] {
  const frames: Frame[] = [];
  let at = openedAt + 60;
  let seed = prefix.length * 97;
  while (at < closedAt) {
    const file = `${prefix}/${frames.length}.jpg`;
    files.set(file, svgDataUrl(scene, at));
    frames.push({ at, file });
    seed = (seed * 9301 + 49297) % 233280;
    const moving = isMoving(scene, at);
    at +=
      (moving ? 34 : 160) + Math.round((seed / 233280) * (moving ? 24 : 220));
  }
  return frames;
}

function isMoving(scene: Scene, at: number): boolean {
  const pointer = scene.pointer ?? [];
  const first = pointer[0];
  const last = pointer[pointer.length - 1];
  const inPointer =
    first !== undefined &&
    last !== undefined &&
    at >= first.at &&
    at <= last.at;
  const inTyping =
    scene.typed !== undefined && at >= scene.typed.from && at <= scene.typed.to;
  const inSwipe =
    scene.swipe !== undefined && at >= scene.swipe.from && at <= scene.swipe.to;
  return inPointer || inTyping || inSwipe;
}

function pointerAt(path: Path, at: number): Point | undefined {
  const first = path[0];
  if (first === undefined || at < first.at) return undefined;
  for (let index = 1; index < path.length; index++) {
    const from = path[index - 1]!;
    const to = path[index]!;
    if (at <= to.at) {
      const linear = (at - from.at) / Math.max(1, to.at - from.at);
      const eased =
        linear < 0.5 ? 2 * linear * linear : 1 - (-2 * linear + 2) ** 2 / 2;
      return {
        x: from.x + (to.x - from.x) * eased,
        y: from.y + (to.y - from.y) * eased,
      };
    }
  }
  return path[path.length - 1];
}

function svgDataUrl(scene: Scene, at: number): string {
  const mobile = scene.kind === 'mobile';
  const width = mobile ? 412 : 1280;
  const height = mobile ? 839 : 800;
  const left = mobile ? 20 : 240;
  const contentWidth = width - left * 2;
  const rowHeight = mobile ? 64 : 56;
  const fontSize = mobile ? 17 : 16;
  const visible = scene.items.filter((item) => item.at <= at);
  const typedLength =
    scene.typed === undefined || at < scene.typed.from
      ? 0
      : Math.min(
          scene.typed.text.length,
          Math.floor(
            ((at - scene.typed.from) / (scene.typed.to - scene.typed.from)) *
              scene.typed.text.length,
          ),
        );
  const typed = scene.typed?.text.slice(0, typedLength) ?? '';
  const pointer =
    scene.pointer === undefined ? undefined : pointerAt(scene.pointer, at);
  const pressed = (scene.pressedDuring ?? []).some(
    ([from, to]) => at >= from && at <= to,
  );
  const swipeOffset =
    scene.swipe === undefined || at < scene.swipe.from
      ? 0
      : -Math.min(
          1,
          (at - scene.swipe.from) / (scene.swipe.to - scene.swipe.from),
        ) * contentWidth;

  const rows = visible
    .map((item, index) => {
      const y = (mobile ? 170 : 190) + index * (rowHeight + 10);
      const offset = scene.swipe?.item === index ? swipeOffset : 0;
      const fresh = at - item.at < 500 ? 'fill="#eef6ff"' : 'fill="#ffffff"';
      return `<g transform="translate(${offset} 0)"><rect x="${left}" y="${y}" width="${contentWidth}" height="${rowHeight}" rx="10" ${fresh} stroke="#e4e4e7"/><circle cx="${left + 26}" cy="${y + rowHeight / 2}" r="8" fill="none" stroke="#a1a1aa" stroke-width="2"/><text x="${left + 48}" y="${y + rowHeight / 2 + 6}" font-size="${fontSize}" fill="#18181b">${item.label}</text></g>`;
    })
    .join('');

  const input = `<rect x="${left}" y="${mobile ? 96 : 110}" width="${contentWidth - (mobile ? 0 : 140)}" height="48" rx="10" fill="#fff" stroke="${typedLength > 0 ? '#3b82f6' : '#d4d4d8'}" stroke-width="1.5"/><text x="${left + 16}" y="${mobile ? 126 : 140}" font-size="${fontSize}" fill="${typed === '' ? '#a1a1aa' : '#18181b'}">${typed === '' ? 'Add a task' : typed}</text>${mobile ? '' : `<rect x="${left + contentWidth - 124}" y="110" width="124" height="48" rx="10" fill="#18181b"/><text x="${left + contentWidth - 62}" y="140" font-size="16" fill="#fff" text-anchor="middle">Add</text>`}`;

  const cursor =
    pointer === undefined
      ? ''
      : mobile
        ? `<circle cx="${pointer.x}" cy="${pointer.y}" r="${pressed ? 22 : 18}" fill="rgba(24,24,27,0.28)" stroke="rgba(24,24,27,0.5)" stroke-width="2"/>`
        : `${pressed ? `<circle cx="${pointer.x}" cy="${pointer.y}" r="20" fill="rgba(59,130,246,0.25)"/>` : ''}<path transform="translate(${pointer.x} ${pointer.y})" d="M0 0 L0 22 L6 16 L10 26 L14 24 L10 15 L18 15 Z" fill="#18181b" stroke="#fff" stroke-width="1.5"/>`;

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" font-family="system-ui, -apple-system, sans-serif"><rect width="${width}" height="${height}" fill="#fafafa"/><rect width="${width}" height="${mobile ? 64 : 64}" fill="#ffffff"/><line x1="0" y1="64" x2="${width}" y2="64" stroke="#e4e4e7"/><text x="${left}" y="40" font-size="${mobile ? 19 : 18}" font-weight="600" fill="#18181b">${scene.title}</text>${input}${rows}${cursor}</svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}
