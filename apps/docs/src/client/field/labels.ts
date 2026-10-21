import type { Pose } from './painter.ts';
import { labelsOf } from './shapes/index.ts';
import type { Clock, Label, ShapeName } from './shapes/index.ts';

/*
 * The words over the field: each shape's Labels as small spans in a layer
 * above the canvas, pinned to their places in the shape. Each frame every
 * Label's place is carried through the same turn, scale and spot the
 * shader gives its shape and set as a transform, with no render in
 * between; spans are kept and reused. A shape's words show only while it
 * holds: they fade out early as it leaves and in late as it forms. On a
 * small screen only names and Messages show, five at most unless the
 * shape says otherwise, and only in the room above the card; and a Label
 * that would cover another, more important one waits. The words in the page's cards are the ones read
 * aloud: this layer is hidden from assistive tech, as the field is.
 */

const BASE =
  'absolute left-0 top-0 whitespace-nowrap font-mono text-[11px] leading-[18px] lg:text-xs lg:leading-5 will-change-transform transition-colors duration-300';
const KINDS = {
  name: 'rounded bg-background/80 px-1 text-muted-foreground data-[lit]:text-foreground',
  note: 'rounded bg-background/80 px-1 text-muted-foreground/80',
  message:
    'rounded-full border border-border bg-background px-2 text-foreground',
} as const;

const smooth = (a: number, b: number, x: number) => {
  const k = Math.min(Math.max((x - a) / (b - a), 0), 1);
  return k * k * (3 - 2 * k);
};

/**
 * How formed each of a morph's two shapes is, for its words: the one left
 * fades out early, the one reached fades in late.
 */
export const formedOf = (blend: number): readonly [number, number] => [
  1 - smooth(0, 0.25, blend),
  smooth(0.75, 1, blend),
];

type Span = {
  readonly el: HTMLSpanElement;
  readonly dot?: HTMLSpanElement;
  text: string;
  kind: string;
  lit: boolean;
  shown: boolean;
};

export type LabelFrame = {
  readonly shapes: ReadonlyArray<{
    readonly name: ShapeName;
    readonly pose: Pose;
    /** How formed it is, 0..1. */
    readonly formed: number;
  }>;
  readonly clock: Clock;
  readonly width: number;
  readonly height: number;
  readonly aspect: number;
  readonly distance: number;
  /** On a small screen, the room the shape has; else none. */
  readonly room?: { readonly top: number; readonly bottom: number };
};

export function labelLayer(parent: HTMLElement, debug: boolean) {
  const layer = document.createElement('div');
  layer.className = 'absolute inset-0 overflow-hidden';
  parent.appendChild(layer);
  const pool: Span[] = [];

  // Each Label's size, measured once, off to the side, for placing it.
  const ruler = document.createElement('span');
  ruler.style.visibility = 'hidden';
  layer.appendChild(ruler);
  const sizes = new Map<string, readonly [number, number]>();
  const sizeOf = (label: Label): readonly [number, number] => {
    const kind = label.kind ?? 'name';
    const key = `${kind}:${label.text}`;
    let size = sizes.get(key);
    if (!size) {
      ruler.className = `${BASE} ${KINDS[kind]}`;
      ruler.textContent = label.text;
      size = [ruler.offsetWidth, ruler.offsetHeight];
      sizes.set(key, size);
    }
    return size;
  };

  const span = (k: number): Span => {
    while (pool.length <= k) {
      const el = document.createElement('span');
      el.style.opacity = '0';
      layer.appendChild(el);
      let dot: HTMLSpanElement | undefined;
      if (debug) {
        dot = document.createElement('span');
        dot.className =
          'absolute left-0 top-0 size-1.5 -translate-1/2 rounded-full bg-foreground';
        layer.appendChild(dot);
      }
      pool.push({ el, dot, text: '', kind: '', lit: false, shown: false });
    }
    return pool[k]!;
  };

  const write = (s: Span, label: Label, lit: boolean) => {
    const kind = label.kind ?? 'name';
    if (s.text !== label.text || s.kind !== kind) {
      s.text = label.text;
      s.kind = kind;
      s.el.textContent = label.text;
      s.el.className = `${BASE} ${KINDS[kind]} ${debug ? 'outline outline-1 outline-foreground/40' : ''}`;
    }
    if (s.lit !== lit) {
      s.lit = lit;
      if (lit) s.el.dataset.lit = '';
      else delete s.el.dataset.lit;
    }
  };

  return {
    draw(frame: LabelFrame): void {
      const { clock, width, height, aspect, distance, room } = frame;
      const small = room !== undefined;
      const placed: Array<readonly [number, number, number, number]> = [];
      let used = 0;
      for (const { name, pose, formed } of frame.shapes) {
        if (formed < 0.01) continue;
        const m = pose.turn;
        let count = 0;
        const { labels, most } = labelsOf(name);
        for (const label of labels) {
          if (small && (label.kind === 'note' || count >= most)) continue;
          const show = (label.show?.(clock) ?? 1) * formed;
          if (show < 0.01) continue;
          // Through the shape's turn, scale and spot, then the camera.
          const [x, y, z] =
            typeof label.at === 'function' ? label.at(clock) : label.at;
          const wx =
            pose.center[0] + (m[0]! * x + m[3]! * y + m[6]! * z) * pose.scale;
          const wy =
            pose.center[1] + (m[1]! * x + m[4]! * y + m[7]! * z) * pose.scale;
          const wz =
            pose.center[2] + (m[2]! * x + m[5]! * y + m[8]! * z) * pose.scale;
          const depth = distance - wz;
          if (depth < 0.3) continue;
          const px = ((wx * distance) / (aspect * depth) + 1) * 0.5 * width;
          const py = (1 - (wy * distance) / depth) * 0.5 * height;

          const [w, h] = sizeOf(label);
          const half = [w / 2 + 2, h / 2 + 1] as const;
          if (room && (py - half[1] < room.top || py + half[1] > room.bottom))
            continue;
          // A Label that would cover a more important one waits.
          const box = [
            px - half[0],
            py - half[1],
            px + half[0],
            py + half[1],
          ] as const;
          if (
            placed.some(
              (b) =>
                box[0] < b[2] &&
                box[2] > b[0] &&
                box[1] < b[3] &&
                box[3] > b[1],
            )
          ) {
            continue;
          }
          placed.push(box);
          const s = span(used);
          write(s, label, label.lit?.(clock) ?? false);
          s.el.style.transform = `translate3d(${(px - w / 2).toFixed(1)}px, ${(py - h / 2).toFixed(1)}px, 0)`;
          s.el.style.opacity = show.toFixed(3);
          if (s.dot) {
            s.dot.style.transform = `translate3d(${px.toFixed(1)}px, ${py.toFixed(1)}px, 0)`;
            s.dot.style.opacity = '1';
          }
          s.shown = true;
          used++;
          count++;
        }
      }
      for (let k = used; k < pool.length; k++) {
        const s = pool[k]!;
        if (!s.shown) continue;
        s.shown = false;
        s.el.style.opacity = '0';
        if (s.dot) s.dot.style.opacity = '0';
      }
    },
    /** After fonts load or the size changes: measure the words again. */
    remeasure(): void {
      sizes.clear();
    },
    dispose(): void {
      layer.remove();
    },
  };
}
