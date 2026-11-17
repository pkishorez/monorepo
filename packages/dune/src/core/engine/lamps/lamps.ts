import { hexToRgb } from '../../effect/define/index.ts';
import type { Program } from '../../platform/webgl/index.ts';
import { MAX_LAMPS } from '../../shader/index.ts';

/*
 * Lamps are elements in the HTML that give off light: a button, a badge,
 * a status dot. Each frame their boxes are read from the DOM, so a lamp
 * that moves, grows or hides is lit where it is, and handed to effects as
 * `u_lamps`, `u_lampColors` and `u_lampReach`.
 */

/** An element that casts light on the rest. */
export type Lamp = {
  readonly element: Element;
  /** `#rrggbb`. */
  readonly color: string;
  readonly intensity: number;
  /** How far its light reaches, in CSS px. */
  readonly reach: number;
};

export class Lamps {
  private readonly rects = new Float32Array(MAX_LAMPS * 4);
  private readonly colors = new Float32Array(MAX_LAMPS * 4);
  private readonly reach = new Float32Array(MAX_LAMPS);
  /** Last frame's values, to tell whether anything changed. */
  private readonly seen = new Float32Array(MAX_LAMPS * 9 + 1);
  private count = 0;

  /** Reads the lamps; true if any moved, changed, came or went. */
  read(canvas: HTMLCanvasElement, lamps: Iterable<Lamp> | undefined): boolean {
    this.rects.fill(0);
    this.colors.fill(0);
    this.reach.fill(0);
    let count = 0;
    if (lamps) {
      const box = canvas.getBoundingClientRect();
      for (const lamp of lamps) {
        if (count >= MAX_LAMPS) break;
        // A lamp inside something hidden gives no light.
        if (!lamp.element.checkVisibility({ visibilityProperty: true }))
          continue;
        const r = lamp.element.getBoundingClientRect();
        if (r.width === 0 && r.height === 0) continue;
        const i = count * 4;
        this.rects.set(
          [
            (r.left + r.width / 2 - box.left) / Math.max(box.width, 1),
            (r.top + r.height / 2 - box.top) / Math.max(box.height, 1),
            r.width / 2,
            r.height / 2,
          ],
          i,
        );
        this.colors.set([...hexToRgb(lamp.color), lamp.intensity], i);
        this.reach[count] = lamp.reach;
        count++;
      }
    }
    this.count = count;
    return this.remember();
  }

  /** Sets the lamps' uniforms on the program in use. */
  apply(gl: WebGL2RenderingContext, program: Program): void {
    const u = program.uniform;
    gl.uniform4fv(u('u_lamps'), this.rects);
    gl.uniform4fv(u('u_lampColors'), this.colors);
    gl.uniform1fv(u('u_lampReach'), this.reach);
    gl.uniform1i(u('u_lampCount'), this.count);
  }

  private remember(): boolean {
    const { seen, count } = this;
    let changed = seen[0] !== count;
    seen[0] = count;
    for (let i = 0; i < count * 4; i++) {
      const at = 1 + i * 2;
      if (seen[at] !== this.rects[i] || seen[at + 1] !== this.colors[i])
        changed = true;
      seen[at] = this.rects[i]!;
      seen[at + 1] = this.colors[i]!;
    }
    for (let i = 0; i < count; i++) {
      const at = 1 + MAX_LAMPS * 8 + i;
      if (seen[at] !== this.reach[i]) changed = true;
      seen[at] = this.reach[i]!;
    }
    return changed;
  }
}
