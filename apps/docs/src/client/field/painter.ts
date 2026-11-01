import { fillRows, floatTexture, program, uniforms } from './gl.ts';
import {
  HEAD_FRAGMENT,
  HEAD_VERTEX,
  PARTICLE_FRAGMENT,
  PARTICLE_VERTEX,
  TRAIL_FRAGMENT,
  TRAIL_VERTEX,
} from './shaders.ts';
import type { Baked, V3 } from './shapes/index.ts';

/*
 * The Painter owns everything on the GPU: the two textures every shape is
 * baked into, one block of rows per shape, and the two programs. Each frame
 * it is handed a Picture, what to draw, and draws it; it decides nothing.
 */

/** One shape as placed on screen this frame. */
export type Pose = {
  readonly layer: number;
  /** Its turn, a 3×3 matrix, column by column. */
  readonly turn: Float32Array;
  readonly center: V3;
  readonly scale: number;
  readonly tint: V3;
  /** 0..1: how lit it is by the comet's arrival. */
  readonly glow: number;
};

export type Picture = {
  readonly width: number;
  readonly height: number;
  /** A particle's size, in device pixels, before depth. */
  readonly size: number;
  readonly aspect: number;
  readonly distance: number;
  readonly time: number;
  readonly motion: number;
  readonly intro: number;
  readonly dark: number;
  readonly blend: number;
  readonly a: Pose;
  readonly b: Pose;
  /** Screen x, y in world units, and strength. */
  readonly pointer: V3;
  /** x, y, z and strength. */
  readonly comet: readonly [number, number, number, number];
  /** The comet's trail as a ribbon: see `Comet.ribbon`. */
  readonly ribbon: Float32Array;
  readonly ribbonCount: number;
};

export type Painter = {
  /** Uploads one baked shape into its block of rows. */
  readonly layer: (index: number, baked: Baked) => void;
  readonly paint: (picture: Picture) => void;
  readonly dispose: () => void;
};

const PARTICLE_UNIFORMS = [
  'uPos',
  'uAux',
  'uWidth',
  'uRows',
  'uCount',
  'uLayerA',
  'uLayerB',
  'uTurnA',
  'uTurnB',
  'uCenterA',
  'uCenterB',
  'uScaleA',
  'uScaleB',
  'uTintA',
  'uTintB',
  'uGlowA',
  'uGlowB',
  'uBlend',
  'uTime',
  'uMotion',
  'uIntro',
  'uDark',
  'uSize',
  'uAspect',
  'uDistance',
  'uPointer',
  'uComet',
] as const;

const COMET_UNIFORMS = [
  'uDark',
  'uSize',
  'uAspect',
  'uDistance',
  'uStrength',
  'uResolution',
] as const;

export function painter(
  gl: WebGL2RenderingContext,
  plan: {
    readonly width: number;
    readonly rows: number;
    readonly layers: number;
  },
): Painter {
  const { width, rows, layers } = plan;
  const count = width * rows;

  const particles = program(gl, PARTICLE_VERTEX, PARTICLE_FRAGMENT);
  const pu = uniforms(gl, particles, PARTICLE_UNIFORMS);
  const pos = floatTexture(gl, width, rows * layers);
  const aux = floatTexture(gl, width, rows * layers);
  const empty = gl.createVertexArray();

  // The comet: a ribbon for its trail, two points for its head.
  const trail = program(gl, TRAIL_VERTEX, TRAIL_FRAGMENT);
  const tu = uniforms(gl, trail, COMET_UNIFORMS);
  const trailBuffer = gl.createBuffer();
  const trailVao = gl.createVertexArray();
  gl.bindVertexArray(trailVao);
  gl.bindBuffer(gl.ARRAY_BUFFER, trailBuffer);
  const aTrail = gl.getAttribLocation(trail, 'aPoint');
  const aNext = gl.getAttribLocation(trail, 'aNext');
  gl.enableVertexAttribArray(aTrail);
  gl.vertexAttribPointer(aTrail, 4, gl.FLOAT, false, 32, 0);
  gl.enableVertexAttribArray(aNext);
  gl.vertexAttribPointer(aNext, 4, gl.FLOAT, false, 32, 16);

  const head = program(gl, HEAD_VERTEX, HEAD_FRAGMENT);
  const hu = uniforms(gl, head, COMET_UNIFORMS);
  const headBuffer = gl.createBuffer();
  const headVao = gl.createVertexArray();
  const headPoints = new Float32Array(8);
  gl.bindVertexArray(headVao);
  gl.bindBuffer(gl.ARRAY_BUFFER, headBuffer);
  const aHead = gl.getAttribLocation(head, 'aPoint');
  gl.enableVertexAttribArray(aHead);
  gl.vertexAttribPointer(aHead, 4, gl.FLOAT, false, 0, 0);
  gl.bindVertexArray(null);

  const cometUniforms = (
    u: Record<(typeof COMET_UNIFORMS)[number], WebGLUniformLocation | null>,
    p: Picture,
  ) => {
    gl.uniform1f(u.uDark, p.dark);
    gl.uniform1f(u.uSize, p.size / 1.55);
    gl.uniform1f(u.uAspect, p.aspect);
    gl.uniform1f(u.uDistance, p.distance);
    gl.uniform1f(u.uStrength, p.comet[3]);
    gl.uniform2f(u.uResolution, p.width, p.height);
  };

  gl.disable(gl.DEPTH_TEST);
  gl.enable(gl.BLEND);
  /*
   * In the dark, points of light add up, colour and coverage both, so the
   * canvas ends each frame with its alpha covering its colour. Left at
   * alpha 0 to add light, as it once was, the canvas holds colour with no
   * coverage: Chrome often shows that as a glow, and a stricter compositor,
   * Helium's, or Chrome's on some GPU paths, shows nothing at all. In the
   * light, ink is laid over paper.
   */
  const blendFor = (dark: number) => {
    if (dark >= 0.5) gl.blendFunc(gl.ONE, gl.ONE);
    else gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
  };

  const pose = (p: Pose, side: 'A' | 'B') => {
    gl.uniform1i(pu[`uLayer${side}`], p.layer);
    gl.uniformMatrix3fv(pu[`uTurn${side}`], false, p.turn);
    gl.uniform3fv(pu[`uCenter${side}`], p.center);
    gl.uniform1f(pu[`uScale${side}`], p.scale);
    gl.uniform3fv(pu[`uTint${side}`], p.tint);
    gl.uniform1f(pu[`uGlow${side}`], p.glow);
  };

  return {
    layer(index, baked) {
      fillRows(gl, pos, index * rows, width, rows, baked.pos);
      fillRows(gl, aux, index * rows, width, rows, baked.aux);
    },

    paint(p) {
      gl.viewport(0, 0, p.width, p.height);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      blendFor(p.dark);

      gl.useProgram(particles);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, pos);
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, aux);
      gl.uniform1i(pu.uPos, 0);
      gl.uniform1i(pu.uAux, 1);
      gl.uniform1i(pu.uWidth, width);
      gl.uniform1i(pu.uRows, rows);
      gl.uniform1f(pu.uCount, count);
      pose(p.a, 'A');
      pose(p.b, 'B');
      gl.uniform1f(pu.uBlend, p.blend);
      gl.uniform1f(pu.uTime, p.time);
      gl.uniform1f(pu.uMotion, p.motion);
      gl.uniform1f(pu.uIntro, p.intro);
      gl.uniform1f(pu.uDark, p.dark);
      gl.uniform1f(pu.uSize, p.size);
      gl.uniform1f(pu.uAspect, p.aspect);
      gl.uniform1f(pu.uDistance, p.distance);
      gl.uniform3fv(pu.uPointer, p.pointer);
      gl.uniform4fv(pu.uComet, p.comet);
      gl.bindVertexArray(empty);
      gl.drawArrays(gl.POINTS, 0, count);

      if (p.comet[3] > 0.004) {
        if (p.ribbonCount > 3) {
          gl.useProgram(trail);
          cometUniforms(tu, p);
          gl.bindVertexArray(trailVao);
          gl.bindBuffer(gl.ARRAY_BUFFER, trailBuffer);
          gl.bufferData(
            gl.ARRAY_BUFFER,
            p.ribbon.subarray(0, p.ribbonCount * 8),
            gl.DYNAMIC_DRAW,
          );
          gl.drawArrays(gl.TRIANGLE_STRIP, 0, p.ribbonCount);
        }
        gl.useProgram(head);
        cometUniforms(hu, p);
        const [x, y, z] = p.comet;
        headPoints.set([x, y, z, 2, x, y, z, 3]);
        gl.bindVertexArray(headVao);
        gl.bindBuffer(gl.ARRAY_BUFFER, headBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, headPoints, gl.DYNAMIC_DRAW);
        gl.drawArrays(gl.POINTS, 0, 2);
      }
      gl.bindVertexArray(null);
    },

    dispose() {
      gl.deleteProgram(particles);
      gl.deleteProgram(trail);
      gl.deleteProgram(head);
      gl.deleteTexture(pos);
      gl.deleteTexture(aux);
      gl.deleteBuffer(trailBuffer);
      gl.deleteBuffer(headBuffer);
      gl.deleteVertexArray(headVao);
      gl.deleteVertexArray(empty);
      gl.deleteVertexArray(trailVao);
    },
  };
}
