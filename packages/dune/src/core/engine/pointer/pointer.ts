import type { Program } from '../../platform/webgl/index.ts';
import { MAX_CLICKS } from '../../shader/index.ts';

/*
 * The pointer as effects read it: where it is, eased so a light glides
 * after it; how fast it moves; whether it is in the canvas or pressed; and
 * the last few presses, for ripples. A drag leaves a trail of presses.
 */

type Point = { x: number; y: number };
type Click = Point & { time: number };

/** A press is added to a drag's trail this often, in seconds. */
const TRAIL = 0.07;

export class Pointer {
  private readonly eased: Point = { x: 0.5, y: 0.4 };
  private readonly raw: Point = { x: 0.5, y: 0.4 };
  private readonly velocity: Point = { x: 0, y: 0 };
  /** Eased towards 1 inside the canvas, 0 outside. */
  private inside = 0;
  private isInside = false;
  private down = false;
  private lastTrail = 0;
  private press = { x: 0, y: 0, time: -1 };
  private readonly clicks: Array<Click> = [];
  private readonly clickData = new Float32Array(MAX_CLICKS * 4);

  constructor(
    private readonly canvas: HTMLCanvasElement,
    /** Effect time now, which presses are stamped with. */
    private readonly now: () => number,
    /** Told when something changed that the next frame must show. */
    private readonly changed: () => void,
  ) {}

  /** Starts listening to the canvas; returns the stop. */
  listen(): () => void {
    const { canvas } = this;
    const move = (e: PointerEvent) => this.move(e);
    const down = (e: PointerEvent) => this.pressed(e);
    const up = () => {
      this.down = false;
      this.changed();
    };
    const leave = () => (this.isInside = false);
    canvas.addEventListener('pointermove', move);
    canvas.addEventListener('pointerdown', down);
    canvas.addEventListener('pointerleave', leave);
    window.addEventListener('pointerup', up);
    return () => {
      canvas.removeEventListener('pointermove', move);
      canvas.removeEventListener('pointerdown', down);
      canvas.removeEventListener('pointerleave', leave);
      window.removeEventListener('pointerup', up);
    };
  }

  /** Eases on by `dt` seconds; true while it is still moving. */
  step(dt: number): boolean {
    const ease = (rate: number) => 1 - Math.exp(-dt * rate);
    const dx = this.raw.x - this.eased.x;
    const dy = this.raw.y - this.eased.y;
    this.velocity.x += (dx * 8 - this.velocity.x) * ease(10);
    this.velocity.y += (dy * 8 - this.velocity.y) * ease(10);
    this.eased.x += dx * ease(10);
    this.eased.y += dy * ease(10);
    const target = this.isInside ? 1 : 0;
    this.inside += (target - this.inside) * ease(5);
    return (
      Math.abs(dx) + Math.abs(dy) > 2e-4 ||
      Math.abs(target - this.inside) > 2e-3 ||
      Math.abs(this.velocity.x) + Math.abs(this.velocity.y) > 1e-3
    );
  }

  /** Sets the pointer's uniforms on the program in use. */
  apply(gl: WebGL2RenderingContext, program: Program): void {
    const u = program.uniform;
    this.clickData.fill(0);
    this.clicks.forEach((c, i) => {
      this.clickData.set([c.x, c.y, c.time, 1], i * 4);
    });
    gl.uniform2f(u('u_pointer'), this.eased.x, this.eased.y);
    gl.uniform2f(u('u_pointerRaw'), this.raw.x, this.raw.y);
    gl.uniform2f(u('u_velocity'), this.velocity.x, this.velocity.y);
    gl.uniform1f(u('u_pointerDown'), this.down ? 1 : 0);
    gl.uniform1f(u('u_pointerInside'), this.inside);
    gl.uniform3f(u('u_press'), this.press.x, this.press.y, this.press.time);
    gl.uniform4fv(u('u_clicks'), this.clickData);
  }

  private toUv(e: PointerEvent): Point {
    const rect = this.canvas.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left) / Math.max(rect.width, 1),
      y: (e.clientY - rect.top) / Math.max(rect.height, 1),
    };
  }

  private move(e: PointerEvent): void {
    const uv = this.toUv(e);
    if (!this.isInside && this.inside < 0.01) {
      // Arriving: start where the pointer is, not glide from where it left.
      this.eased.x = uv.x;
      this.eased.y = uv.y;
    }
    this.raw.x = uv.x;
    this.raw.y = uv.y;
    this.isInside = true;
    if (this.down && this.now() - this.lastTrail > TRAIL) this.click(uv);
  }

  private pressed(e: PointerEvent): void {
    this.move(e);
    this.down = true;
    const uv = this.toUv(e);
    this.press = { ...uv, time: this.now() };
    this.click(uv);
  }

  private click(uv: Point): void {
    this.lastTrail = this.now();
    this.clicks.push({ ...uv, time: this.now() });
    if (this.clicks.length > MAX_CLICKS) this.clicks.shift();
    this.changed();
  }
}
