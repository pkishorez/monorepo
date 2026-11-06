import {
  defineEffect,
  hexToRgb,
  type EffectDefinition,
  type EffectInstance,
} from '../../effect/define/index.ts';
import {
  ShaderError,
  createProgram,
  createTarget,
  deleteTarget,
  type Program,
  type Target,
} from '../../platform/webgl/index.ts';
import {
  PASSTHROUGH,
  effectShader,
  isAnimated,
  memoryShader,
  prepareShader,
} from '../../shader/index.ts';

/*
 * The effects, run in order over the HTML: each reads the one before and
 * draws into a texture for the next; the last draws to the screen. An
 * effect runs up to three programs a frame:
 *
 *   prepare  only when the HTML or its params changed, at half size
 *   memory   every frame, reading last frame's memory, writing this one's
 *   effect   every frame, reading both
 *
 * Programs are compiled once per definition and kept; changing params
 * only changes uniforms.
 */

type Compiled = {
  readonly draw: Program;
  readonly step: Program | null;
  readonly prepare: Program | null;
};

type Uniform =
  | {
      readonly location: WebGLUniformLocation;
      readonly kind: 'float';
      readonly value: number;
    }
  | {
      readonly location: WebGLUniformLocation;
      readonly kind: 'vec3';
      readonly value: Float32Array;
    };

type Pass = {
  readonly instance: EffectInstance;
  readonly compiled: Compiled;
  /** The params as uniforms, resolved when they change, not every frame. */
  readonly uniforms: {
    readonly draw: ReadonlyArray<Uniform>;
    readonly step: ReadonlyArray<Uniform>;
    readonly prepare: ReadonlyArray<Uniform>;
  };
  /** Where it draws, unless it is the last pass. */
  target: Target | null;
  /** Last frame's memory and this frame's, swapped after each step. */
  memory: [Target, Target] | null;
  /** prepare()'s output, and the version of the HTML it was made from. */
  prepared: Target | null;
  preparedFrom: number;
};

/** Sets the uniforms every effect shares: size, time, pointer, lamps. */
export type Shared = (program: Program) => void;

const passthrough = defineEffect({
  name: 'passthrough',
  params: {},
  glsl: PASSTHROUGH,
});

/**
 * prepare() output is drawn at this fraction of the canvas's size: what
 * it holds (height maps, glows) is blurred anyway, and a quarter of the
 * pixels is a quarter of the cost each time the HTML changes.
 */
const PREPARE_SCALE = 0.5;

export class Passes {
  private passes: Array<Pass> = [];
  private readonly programs = new Map<number, Compiled>();
  private width = 1;
  private height = 1;
  /** Whether some effect changes with time, and so draws every frame. */
  animated = false;

  constructor(
    private readonly gl: WebGL2RenderingContext,
    private readonly onError?: (error: Error) => void,
  ) {}

  /**
   * The effects to run, in order; none draws the HTML as it is. Recompiles
   * only for definitions it hasn't seen. True if what is drawn changed.
   */
  set(instances: ReadonlyArray<EffectInstance>): boolean {
    const list = instances.length > 0 ? instances : [passthrough()];
    const same =
      list.length === this.passes.length &&
      list.every(
        (it, i) => it.definition === this.passes[i]?.instance.definition,
      );
    if (same) {
      let changed = false;
      list.forEach((instance, i) => {
        const pass = this.passes[i]!;
        if (sameValues(pass.instance.values, instance.values)) return;
        this.passes[i] = {
          ...pass,
          instance,
          uniforms: this.resolve(instance, pass.compiled),
          preparedFrom: -1,
        };
        changed = true;
      });
      return changed;
    }
    this.release();
    this.passes = list.map((instance) => {
      const compiled = this.compile(instance.definition);
      return {
        instance,
        compiled,
        uniforms: this.resolve(instance, compiled),
        target: null,
        memory: null,
        prepared: null,
        preparedFrom: -1,
      };
    });
    this.animated = list.some((it) => isAnimated(it.definition));
    this.allocate();
    return true;
  }

  /** The canvas's size changed, in device pixels. */
  resize(width: number, height: number): void {
    this.width = width;
    this.height = height;
    this.release();
    this.allocate();
  }

  /**
   * Runs every pass over the HTML. `version` changes whenever the HTML
   * does: prepare() runs again only then.
   */
  draw(html: WebGLTexture, version: number, shared: Shared): void {
    let source: Target | null = null;
    this.passes.forEach((pass, i) => {
      const last = i === this.passes.length - 1;
      const { compiled, uniforms } = pass;
      const run = (
        program: Program,
        params: ReadonlyArray<Uniform>,
        target: Target | null,
        memory: Target | null,
      ) =>
        this.run(program, params, shared, {
          html,
          target,
          source,
          memory,
          prepared: pass.prepared,
        });
      if (compiled.prepare && pass.prepared && pass.preparedFrom !== version) {
        run(compiled.prepare, uniforms.prepare, pass.prepared, null);
        pass.preparedFrom = version;
      }
      if (compiled.step && pass.memory) {
        const [previous, next] = pass.memory;
        run(compiled.step, uniforms.step, next, previous);
        pass.memory = [next, previous];
      }
      run(
        compiled.draw,
        uniforms.draw,
        last ? null : pass.target,
        pass.memory?.[0] ?? null,
      );
      source = pass.target;
    });
  }

  /** Bytes the passes' textures hold. */
  bytes(): number {
    const plain = this.width * this.height * 4;
    let bytes = 0;
    for (const pass of this.passes) {
      if (pass.target) bytes += plain;
      if (pass.memory) bytes += plain * 4; // two half-float targets
      if (pass.prepared) bytes += plain * 2 * PREPARE_SCALE * PREPARE_SCALE;
    }
    return bytes;
  }

  dispose(): void {
    this.release();
    for (const { draw, step, prepare } of this.programs.values())
      for (const p of [draw, step, prepare])
        if (p) this.gl.deleteProgram(p.program);
    this.programs.clear();
  }

  private run(
    program: Program,
    params: ReadonlyArray<Uniform>,
    shared: Shared,
    textures: {
      readonly html: WebGLTexture;
      readonly target: Target | null;
      /** The pass before's output; the HTML for the first. */
      readonly source: Target | null;
      readonly memory: Target | null;
      readonly prepared: Target | null;
    },
  ): void {
    const { gl } = this;
    const { html, target, source, memory, prepared } = textures;
    const u = program.uniform;
    gl.bindFramebuffer(gl.FRAMEBUFFER, target?.framebuffer ?? null);
    gl.viewport(
      0,
      0,
      target?.width ?? this.width,
      target?.height ?? this.height,
    );
    gl.useProgram(program.program);

    const bind = (unit: number, name: string, texture: WebGLTexture) => {
      gl.activeTexture(gl.TEXTURE0 + unit);
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.uniform1i(u(name), unit);
    };
    bind(0, 'u_html', html);
    bind(1, 'u_source', source?.texture ?? html);
    // Render targets are drawn bottom row first; the snapshot top row first.
    gl.uniform1f(u('u_sourceFlip'), source ? 1 : 0);
    bind(2, 'u_memory', memory?.texture ?? html);
    bind(3, 'u_prepared', prepared?.texture ?? html);

    shared(program);
    for (const param of params) {
      if (param.kind === 'float') gl.uniform1f(param.location, param.value);
      else gl.uniform3fv(param.location, param.value);
    }
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  private compile(definition: EffectDefinition): Compiled {
    const cached = this.programs.get(definition.id);
    if (cached) return cached;
    const { gl } = this;
    const stage = (source: string, label: string) =>
      createProgram(gl, source, `${definition.name}${label}`);
    let compiled: Compiled;
    try {
      compiled = {
        draw: stage(effectShader(definition), ''),
        step: definition.memory
          ? stage(memoryShader(definition), ' memory')
          : null,
        prepare: definition.prepare
          ? stage(prepareShader(definition), ' prepare')
          : null,
      };
    } catch (error) {
      if (error instanceof ShaderError) console.error(error.message);
      this.onError?.(error as Error);
      // A broken effect draws the HTML as it is, rather than nothing.
      compiled = this.compile(passthrough.definition);
    }
    this.programs.set(definition.id, compiled);
    return compiled;
  }

  private resolve(
    instance: EffectInstance,
    compiled: Compiled,
  ): Pass['uniforms'] {
    const { params } = instance.definition;
    const resolve = (program: Program | null): Array<Uniform> => {
      if (!program) return [];
      const out: Array<Uniform> = [];
      for (const [key, value] of Object.entries(instance.values)) {
        const location = program.uniform(`p.${key}`);
        if (!location) continue;
        if (params[key]?.kind === 'color')
          out.push({
            location,
            kind: 'vec3',
            value: new Float32Array(hexToRgb(String(value))),
          });
        else out.push({ location, kind: 'float', value: Number(value) });
      }
      return out;
    };
    return {
      draw: resolve(compiled.draw),
      step: resolve(compiled.step),
      prepare: resolve(compiled.prepare),
    };
  }

  private allocate(): void {
    const { gl, width, height } = this;
    this.passes.forEach((pass, i) => {
      if (i < this.passes.length - 1)
        pass.target = createTarget(gl, width, height, false);
      if (pass.compiled.step)
        pass.memory = [
          createTarget(gl, width, height, true),
          createTarget(gl, width, height, true),
        ];
      if (pass.compiled.prepare) {
        pass.prepared = createTarget(
          gl,
          Math.max(1, Math.round(width * PREPARE_SCALE)),
          Math.max(1, Math.round(height * PREPARE_SCALE)),
          true,
        );
        pass.preparedFrom = -1;
      }
    });
  }

  private release(): void {
    for (const pass of this.passes) {
      for (const t of [pass.target, pass.prepared, ...(pass.memory ?? [])])
        if (t) deleteTarget(this.gl, t);
      pass.target = null;
      pass.memory = null;
      pass.prepared = null;
    }
  }
}

const sameValues = (
  a: Readonly<Record<string, unknown>>,
  b: Readonly<Record<string, unknown>>,
) => {
  for (const key in a) if (a[key] !== b[key]) return false;
  for (const key in b) if (!(key in a)) return false;
  return true;
};
