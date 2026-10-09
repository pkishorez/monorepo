/*
 * `<oak-pixel-badge>`: a mirrored 7 × 7 pattern drawn from a hash of its
 * `value`, in `fill` on `background`, on a canvas `size` pixels wide. It
 * stands in for Shoelace's `<sl-qr-code>`: the same properties, but no QR
 * encoder, which is a library's worth of code on its own. Setting any
 * property redraws it.
 */

const CELLS = 7;

/** FNV-1a: a stable 32-bit hash of the text. */
const hash = (text: string) => {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
};

export const definePixelBadge = (name: string) => {
  class PixelBadge extends HTMLElement {
    #value = '';
    #fill = '#000000';
    #background = '#ffffff';
    #size = 160;
    readonly #canvas: HTMLCanvasElement;

    constructor() {
      super();
      const root = this.attachShadow({ mode: 'open' });
      this.#canvas = document.createElement('canvas');
      this.#canvas.setAttribute('role', 'img');
      this.#canvas.style.display = 'block';
      root.append(this.#canvas);
      this.#draw();
    }

    get value() {
      return this.#value;
    }
    set value(next: string) {
      this.#value = next;
      this.#draw();
    }
    get fill() {
      return this.#fill;
    }
    set fill(next: string) {
      this.#fill = next;
      this.#draw();
    }
    get background() {
      return this.#background;
    }
    set background(next: string) {
      this.#background = next;
      this.#draw();
    }
    get size() {
      return this.#size;
    }
    set size(next: number) {
      this.#size = next;
      this.#draw();
    }

    #draw() {
      const canvas = this.#canvas;
      const scale = window.devicePixelRatio || 1;
      canvas.width = canvas.height = this.#size * scale;
      canvas.style.width = canvas.style.height = `${this.#size}px`;
      canvas.setAttribute('aria-label', `Pattern for ${this.#value}`);
      const context = canvas.getContext('2d');
      if (!context) return;
      context.scale(scale, scale);
      context.fillStyle = this.#background;
      context.fillRect(0, 0, this.#size, this.#size);
      if (this.#value === '') return;
      const bits = hash(this.#value);
      const cell = this.#size / (CELLS + 2);
      context.fillStyle = this.#fill;
      const half = Math.ceil(CELLS / 2);
      for (let row = 0; row < CELLS; row++)
        for (let column = 0; column < half; column++) {
          if (!((bits >> (row * half + column)) & 1)) continue;
          for (const x of new Set([column, CELLS - 1 - column]))
            context.fillRect((x + 1) * cell, (row + 1) * cell, cell, cell);
        }
    }
  }
  if (!customElements.get(name)) customElements.define(name, PixelBadge);
};
