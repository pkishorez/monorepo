import { hexOf, hsvOf } from './hsv.js';
import type { Hsv } from './hsv.js';

/*
 * `<oak-color-picker>`: a saturation and brightness pad over a hue strip,
 * standing in for vanilla-colorful's `<hex-color-picker>`. It takes a `color`
 * property (`#rrggbb`) and fires `color-changed` with `{ value }` while
 * dragged or moved with the arrow keys. It keeps its own hue, so dragging
 * through gray does not lose it.
 */

const STYLE = `
:host { display: inline-flex; flex-direction: column; gap: 8px; width: 160px; touch-action: none; user-select: none; }
.pad, .hue { position: relative; border-radius: 6px; outline-offset: 2px; }
.pad { height: 120px; cursor: crosshair;
  background: linear-gradient(to top, #000, transparent), linear-gradient(to right, #fff, transparent), var(--hue); }
.hue { height: 12px; cursor: ew-resize;
  background: linear-gradient(to right, #f00, #ff0, #0f0, #0ff, #00f, #f0f, #f00); }
.thumb { position: absolute; width: 12px; height: 12px; border: 2px solid #fff; border-radius: 50%;
  box-shadow: 0 0 0 1px rgb(0 0 0 / 0.4); transform: translate(-50%, -50%); pointer-events: none; }
.hue .thumb { top: 50%; }
`;

const clamp = (n: number) => Math.min(1, Math.max(0, n));

export const defineColorPicker = (name: string) => {
  class ColorPicker extends HTMLElement {
    #hsv: Hsv = { h: 0, s: 0, v: 0 };
    readonly #pad: HTMLElement;
    readonly #hue: HTMLElement;

    constructor() {
      super();
      const root = this.attachShadow({ mode: 'open' });
      root.innerHTML = `<style>${STYLE}</style>
        <div class="pad" tabindex="0" role="slider" aria-label="Saturation and brightness"><div class="thumb"></div></div>
        <div class="hue" tabindex="0" role="slider" aria-label="Hue" aria-valuemin="0" aria-valuemax="360"><div class="thumb"></div></div>`;
      this.#pad = root.querySelector('.pad')!;
      this.#hue = root.querySelector('.hue')!;
      this.#drag(this.#pad, (x, y) => ({ ...this.#hsv, s: x, v: 1 - y }));
      this.#drag(this.#hue, (x) => ({ ...this.#hsv, h: x * 359.9 }));
      this.#keys(this.#pad, (dx, dy) => ({
        ...this.#hsv,
        s: clamp(this.#hsv.s + dx),
        v: clamp(this.#hsv.v - dy),
      }));
      this.#keys(this.#hue, (dx) => ({
        ...this.#hsv,
        h: Math.min(359.9, Math.max(0, this.#hsv.h + dx * 360)),
      }));
      this.#draw();
    }

    get color() {
      return hexOf(this.#hsv);
    }

    set color(hex: string) {
      const next = hsvOf(hex);
      if (!next || hexOf(next) === this.color) return;
      // Gray has no hue of its own: keep the one the user picked.
      this.#hsv = next.s === 0 ? { ...next, h: this.#hsv.h } : next;
      this.#draw();
    }

    #pick(next: Hsv) {
      this.#hsv = next;
      this.#draw();
      this.dispatchEvent(
        new CustomEvent('color-changed', { detail: { value: this.color } }),
      );
    }

    #drag(area: HTMLElement, at: (x: number, y: number) => Hsv) {
      const move = (event: PointerEvent) => {
        const box = area.getBoundingClientRect();
        this.#pick(
          at(
            clamp((event.clientX - box.left) / box.width),
            clamp((event.clientY - box.top) / box.height),
          ),
        );
      };
      area.addEventListener('pointerdown', (event) => {
        area.setPointerCapture(event.pointerId);
        move(event);
        area.addEventListener('pointermove', move);
      });
      area.addEventListener('pointerup', () =>
        area.removeEventListener('pointermove', move),
      );
    }

    #keys(area: HTMLElement, by: (dx: number, dy: number) => Hsv) {
      const STEP = 0.02;
      const moves: Record<string, [number, number]> = {
        ArrowLeft: [-STEP, 0],
        ArrowRight: [STEP, 0],
        ArrowUp: [0, -STEP],
        ArrowDown: [0, STEP],
      };
      area.addEventListener('keydown', (event) => {
        const move = moves[event.key];
        if (!move) return;
        event.preventDefault();
        this.#pick(by(...move));
      });
    }

    #draw() {
      const { h, s, v } = this.#hsv;
      this.#pad.style.setProperty('--hue', hexOf({ h, s: 1, v: 1 }));
      const [padThumb, hueThumb] = [
        this.#pad.firstElementChild as HTMLElement,
        this.#hue.firstElementChild as HTMLElement,
      ];
      padThumb.style.left = `${s * 100}%`;
      padThumb.style.top = `${(1 - v) * 100}%`;
      hueThumb.style.left = `${(h / 360) * 100}%`;
      this.#hue.setAttribute('aria-valuenow', String(Math.round(h)));
    }
  }
  if (!customElements.get(name)) customElements.define(name, ColorPicker);
};
