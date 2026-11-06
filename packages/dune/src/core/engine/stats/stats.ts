/*
 * What the canvas costs, tallied as it draws and averaged when asked: the
 * main thread's time per frame, the GPU's where the browser can time it,
 * and the HTML snapshots copied in.
 */

/** How the engine has been doing since the last time it was asked. */
export type Stats = {
  /** Frames drawn per second. A still effect draws only when something changes. */
  readonly fps: number;
  /** Main-thread ms to issue one frame. */
  readonly cpuMs: number;
  /** GPU ms per frame, where the browser exposes timer queries. */
  readonly gpuMs: number | null;
  /** HTML snapshots copied in per second, and main-thread ms each. */
  readonly uploads: number;
  readonly uploadMs: number;
  /** Whether some effect animates, and so draws every frame. */
  readonly animated: boolean;
  /** Device pixels drawn. */
  readonly width: number;
  readonly height: number;
  /** Textures held, in MB. */
  readonly memoryMb: number;
};

type TimerExt = { TIME_ELAPSED_EXT: number; GPU_DISJOINT_EXT: number };

/** One frame being timed. */
export type Timing = {
  readonly start: number;
  readonly query: WebGLQuery | null;
};

export class Meter {
  private readonly ext: TimerExt | null;
  /** A GPU timing not read back yet: one at a time. */
  private pending: WebGLQuery | null = null;
  private tally = Meter.empty();

  constructor(private readonly gl: WebGL2RenderingContext) {
    this.ext = gl.getExtension(
      'EXT_disjoint_timer_query_webgl2',
    ) as TimerExt | null;
  }

  private static empty() {
    return {
      since: performance.now(),
      frames: 0,
      cpu: 0,
      uploads: 0,
      upload: 0,
      gpu: 0,
      gpuFrames: 0,
    };
  }

  /** Starts timing a frame. */
  begin(): Timing {
    const { gl, ext } = this;
    const query = ext && !this.pending ? gl.createQuery() : null;
    if (query) gl.beginQuery(ext!.TIME_ELAPSED_EXT, query);
    return { start: performance.now(), query };
  }

  /** Ends timing a frame. */
  end(frame: Timing): void {
    if (frame.query) {
      this.gl.endQuery(this.ext!.TIME_ELAPSED_EXT);
      this.pending = frame.query;
    }
    this.tally.frames++;
    this.tally.cpu += performance.now() - frame.start;
  }

  /** Counts a snapshot copied in, and how long it took. */
  upload(ms: number): void {
    this.tally.uploads++;
    this.tally.upload += ms;
  }

  /** Reads back the GPU's time for a past frame, once it is ready. */
  poll(): void {
    const { gl, ext, pending } = this;
    if (!ext || !pending) return;
    if (!gl.getQueryParameter(pending, gl.QUERY_RESULT_AVAILABLE)) return;
    if (!gl.getParameter(ext.GPU_DISJOINT_EXT)) {
      this.tally.gpu += gl.getQueryParameter(pending, gl.QUERY_RESULT) / 1e6;
      this.tally.gpuFrames++;
    }
    gl.deleteQuery(pending);
    this.pending = null;
  }

  /** Averages since the last call, and starts counting afresh. */
  read(now: {
    readonly animated: boolean;
    readonly width: number;
    readonly height: number;
    readonly bytes: number;
  }): Stats {
    const t = this.tally;
    const seconds = Math.max((performance.now() - t.since) / 1000, 1e-3);
    this.tally = Meter.empty();
    return {
      fps: t.frames / seconds,
      cpuMs: t.frames ? t.cpu / t.frames : 0,
      gpuMs: this.ext ? (t.gpuFrames ? t.gpu / t.gpuFrames : 0) : null,
      uploads: t.uploads / seconds,
      uploadMs: t.uploads ? t.upload / t.uploads : 0,
      animated: now.animated,
      width: now.width,
      height: now.height,
      memoryMb: now.bytes / 1048576,
    };
  }

  dispose(): void {
    if (this.pending) this.gl.deleteQuery(this.pending);
    this.pending = null;
  }
}
