import type { ParamSpecs, ParamValues } from './params.ts';

/*
 * An Effect is a fragment shader with typed, tweakable params. Defining one
 * gives back a function: call it with some params to get an Instance, the
 * thing a canvas runs. The definition is compiled once; changing an
 * Instance's params only changes uniforms.
 */

export type EffectSpec<P extends ParamSpecs> = {
  /** Shown in controls and used in shader error messages. */
  readonly name: string;
  readonly params: P;
  /**
   * GLSL defining `vec4 effect(vec2 uv)`, premultiplied colour out. `uv` is
   * (0,0) at the top left. Params are read as `p.<name>`. The shader
   * prelude's inputs and helpers (`html`, `source`, noise, …) are in scope.
   */
  readonly glsl: string;
  /**
   * Optional per-pixel memory that outlives a frame: GLSL defining
   * `vec4 update(vec2 uv)`, which reads last frame's value with
   * `previous(uv)`. The effect then reads this frame's with `memory(uv)`.
   */
  readonly memory?: string;
  /**
   * Optional work that depends only on the HTML and the params: GLSL
   * defining `vec4 prepare(vec2 uv)`. It runs when either changes, not
   * every frame, and the effect reads it with `prepared(uv)`. Use it for
   * blurs, height maps, normals: anything costly that the pointer and
   * time don't touch.
   */
  readonly prepare?: string;
};

export type EffectDefinition<P extends ParamSpecs = ParamSpecs> =
  EffectSpec<P> & {
    /** Unique per definition: compiled programs are cached by it. */
    readonly id: number;
    /** Every param at its default. */
    readonly defaults: ParamValues<P>;
  };

/** One use of an Effect, with its params resolved. */
export type EffectInstance<P extends ParamSpecs = ParamSpecs> = {
  readonly definition: EffectDefinition<P>;
  readonly values: ParamValues<P>;
};

/** A defined Effect: call it to use it; read `.definition` to inspect it. */
export type Effect<P extends ParamSpecs = ParamSpecs> = ((
  values?: Partial<ParamValues<P>>,
) => EffectInstance<P>) & { readonly definition: EffectDefinition<P> };

let next = 0;

/** Defines an Effect. Call the result with params to use it. */
export const defineEffect = <const P extends ParamSpecs>(
  spec: EffectSpec<P>,
): Effect<P> => {
  const defaults = Object.fromEntries(
    Object.entries(spec.params).map(([key, param]) => [key, param.value]),
  ) as ParamValues<P>;
  const definition: EffectDefinition<P> = { ...spec, id: next++, defaults };
  const use = (values?: Partial<ParamValues<P>>): EffectInstance<P> => ({
    definition,
    values: { ...defaults, ...values },
  });
  return Object.assign(use, { definition });
};
