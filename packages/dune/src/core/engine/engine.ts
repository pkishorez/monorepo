import type { EffectInstance } from '../effect/define/index.ts';
import {
  allocate,
  place,
  requestPaint,
  upload,
  type Api,
} from '../platform/html-in-canvas/index.ts';
import {
  createTexture,
  createTriangle,
  type Program,
} from '../platform/webgl/index.ts';
import { Clock, everyFrame } from './frame/index.ts';
import { Lamps, type Lamp } from './lamps/index.ts';
import { Passes } from './passes/index.ts';
import { Pointer } from './pointer/index.ts';
import { Meter, type Stats } from './stats/index.ts';

/*
 * The engine behind one canvas. It owns the WebGL context and, each frame
 * something has changed, draws the HTML's snapshot through the effects:
 *
 *   paint event ─▶ snapshot texture ─▶ effect 1 ─▶ … ─▶ effect n ─▶ screen
 *
 * The browser fires `paint` when the HTML has changed and a fresh snapshot
 * is ready; it is copied in and drawn at once, so the canvas never shows
 * HTML older than the DOM. Between paints it draws again only when
 * something an effect reads has moved, the pointer or a lamp, or every
 * frame if an effect animates with time. It knows nothing of React.
 */

export type EngineOptions = {
  readonly canvas: HTMLCanvasElement;
  /** The canvas's one drawable child, which fills it. */
  readonly content: HTMLElement;
  readonly api: Exclude<Api, 'none'>;
  /** The lamps right now, read every frame. */
  readonly lamps?: () => Iterable<Lamp>;
  readonly onError?: (error: Error) => void;
  /** Device pixels per CSS pixel are capped here, to bound the fill cost. */
  readonly maxDpr?: number;
};

export class Engine {
  private readonly gl: WebGL2RenderingContext;
  /** The HTML's latest snapshot. */
  private readonly html: WebGLTexture;
  private readonly triangle: WebGLVertexArrayObject;
  private readonly passes: Passes;
  private readonly pointer: Pointer;
  private readonly lamps = new Lamps();
  private readonly meter: Meter;
  private readonly clock = new Clock();
  private readonly cleanup: Array<() => void> = [];

  /** Device pixels; 0 until first measured. */
  private width = 0;
  private height = 0;
  private dpr = 1;
  /** Whether a snapshot has been copied in yet: nothing is drawn before. */
  private snapshot = false;
  /** Bumped with each snapshot, so prepare() knows when to run again. */
  private version = 0;
  private dirty = true;
  private visible = true;

  constructor(private readonly options: EngineOptions) {
    const { canvas } = options;
    const gl = canvas.getContext('webgl2', {
      alpha: true,
      premultipliedAlpha: true,
      antialias: false,
      powerPreference: 'high-performance',
    });
    if (!gl) throw new Error('WebGL2 is not available');
    this.gl = gl;
    this.triangle = createTriangle(gl);
    this.html = createTexture(gl);
    this.passes = new Passes(gl, options.onError);
    this.meter = new Meter(gl);
    this.pointer = new Pointer(
      canvas,
      () => this.clock.time,
      () => (this.dirty = true),
    );

    this.cleanup.push(this.pointer.listen());
    this.listen(canvas, 'paint', () => this.onPaint());
    this.listen(canvas, 'webglcontextlost', (e) => e.preventDefault());
    const resize = new ResizeObserver(() => this.resize());
    resize.observe(canvas);
    this.cleanup.push(() => resize.disconnect());
    const seen = new IntersectionObserver(([entry]) => {
      this.visible = entry?.isIntersecting ?? true;
      this.dirty = true;
    });
    seen.observe(canvas);
    this.cleanup.push(() => seen.disconnect());

    this.resize();
    this.setEffects([]);
    this.cleanup.push(everyFrame(this.tick));
  }

  /** The effects to run, in order. Recompiles only for new definitions. */
  setEffects(instances: ReadonlyArray<EffectInstance>): void {
    if (this.passes.set(instances)) this.dirty = true;
  }

  /** Stops time; the canvas still redraws when the HTML changes. */
  setPaused(paused: boolean): void {
    this.clock.paused = paused;
    this.dirty = true;
  }

  /** Averages since the last call. */
  stats(): Stats {
    return this.meter.read({
      animated: this.passes.animated,
      width: this.width,
      height: this.height,
      bytes: this.width * this.height * 4 + this.passes.bytes(),
    });
  }

  /**
   * Draws `frames` frames back to back, each waited on with a 1px read,
   * and returns ms per frame: what a frame costs end to end, whatever the
   * display's refresh rate.
   */
  benchmark(frames = 60): number {
    const { gl } = this;
    const pixel = new Uint8Array(4);
    this.draw();
    gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
    const start = performance.now();
    for (let i = 0; i < frames; i++) {
      this.clock.advance(1 / 60);
      this.draw();
      gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
    }
    return (performance.now() - start) / frames;
  }

  dispose(): void {
    for (const stop of this.cleanup) stop();
    this.passes.dispose();
    this.meter.dispose();
    this.gl.deleteTexture(this.html);
    this.gl.getExtension('WEBGL_lose_context')?.loseContext();
  }

  private onPaint(): void {
    const { gl } = this;
    const { canvas, content, api } = this.options;
    const start = performance.now();
    gl.bindTexture(gl.TEXTURE_2D, this.html);
    try {
      upload(gl, api, content, this.width, this.height);
      place(canvas, content);
      this.snapshot = true;
    } catch (error) {
      this.options.onError?.(error as Error);
    }
    this.meter.upload(performance.now() - start);
    this.version++;
    this.draw();
  }

  private resize(): void {
    const { canvas, maxDpr = 2 } = this.options;
    const rect = canvas.getBoundingClientRect();
    this.dpr = Math.min(window.devicePixelRatio || 1, maxDpr);
    const width = Math.max(1, Math.round(rect.width * this.dpr));
    const height = Math.max(1, Math.round(rect.height * this.dpr));
    if (width === this.width && height === this.height) return;
    this.width = width;
    this.height = height;
    canvas.width = width;
    canvas.height = height;
    this.gl.bindTexture(this.gl.TEXTURE_2D, this.html);
    allocate(this.gl, this.options.api, width, height);
    this.passes.resize(width, height);
    this.dirty = true;
    requestPaint(canvas);
  }

  private tick = (now: number): void => {
    const dt = this.clock.elapse(now);
    this.meter.poll();
    if (!this.visible) return;
    this.clock.advance(dt);
    const moving = this.pointer.step(dt);
    const lampsMoved = this.lamps.read(
      this.options.canvas,
      this.options.lamps?.(),
    );
    const animating = this.passes.animated && !this.clock.paused;
    if (animating || this.dirty || moving || lampsMoved) this.draw();
  };

  private draw(): void {
    if (!this.snapshot) return;
    const timing = this.meter.begin();
    this.gl.bindVertexArray(this.triangle);
    this.passes.draw(this.html, this.version, this.shared);
    this.meter.end(timing);
    this.dirty = false;
  }

  /** The uniforms every effect reads, set on each program as it runs. */
  private shared = (program: Program): void => {
    const { gl } = this;
    const u = program.uniform;
    gl.uniform2f(u('u_resolution'), this.width, this.height);
    gl.uniform2f(u('u_size'), this.width / this.dpr, this.height / this.dpr);
    gl.uniform1f(u('u_dpr'), this.dpr);
    gl.uniform1f(u('u_time'), this.clock.time);
    gl.uniform1f(u('u_delta'), this.clock.delta);
    this.pointer.apply(gl, program);
    this.lamps.apply(gl, program);
  };

  private listen(
    target: EventTarget,
    type: string,
    handler: (e: Event) => void,
  ): void {
    target.addEventListener(type, handler);
    this.cleanup.push(() => target.removeEventListener(type, handler));
  }
}
