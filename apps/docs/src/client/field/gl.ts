/*
 * The few WebGL2 calls the field needs, named: compile a program, find its
 * uniforms, make a float texture and fill rows of it.
 */

export function program(
  gl: WebGL2RenderingContext,
  vertex: string,
  fragment: string,
): WebGLProgram {
  const shader = (type: number, source: string) => {
    const s = gl.createShader(type)!;
    gl.shaderSource(s, source);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS) && !gl.isContextLost()) {
      throw new Error(
        `field: shader did not compile\n${gl.getShaderInfoLog(s)}`,
      );
    }
    return s;
  };
  const p = gl.createProgram()!;
  const vs = shader(gl.VERTEX_SHADER, vertex);
  const fs = shader(gl.FRAGMENT_SHADER, fragment);
  gl.attachShader(p, vs);
  gl.attachShader(p, fs);
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS) && !gl.isContextLost()) {
    throw new Error(`field: program did not link\n${gl.getProgramInfoLog(p)}`);
  }
  gl.deleteShader(vs);
  gl.deleteShader(fs);
  return p;
}

/** Every uniform named, by name. */
export function uniforms<K extends string>(
  gl: WebGL2RenderingContext,
  p: WebGLProgram,
  names: readonly K[],
): Record<K, WebGLUniformLocation | null> {
  return Object.fromEntries(
    names.map((name) => [name, gl.getUniformLocation(p, name)]),
  ) as Record<K, WebGLUniformLocation | null>;
}

/** An empty RGBA float texture, read texel by texel. */
export function floatTexture(
  gl: WebGL2RenderingContext,
  width: number,
  height: number,
): WebGLTexture {
  const t = gl.createTexture()!;
  gl.bindTexture(gl.TEXTURE_2D, t);
  gl.texStorage2D(gl.TEXTURE_2D, 1, gl.RGBA32F, width, height);
  for (const p of [gl.TEXTURE_MIN_FILTER, gl.TEXTURE_MAG_FILTER]) {
    gl.texParameteri(gl.TEXTURE_2D, p, gl.NEAREST);
  }
  for (const p of [gl.TEXTURE_WRAP_S, gl.TEXTURE_WRAP_T]) {
    gl.texParameteri(gl.TEXTURE_2D, p, gl.CLAMP_TO_EDGE);
  }
  return t;
}

/** Fills `rows` rows of a float texture from row `y`. */
export function fillRows(
  gl: WebGL2RenderingContext,
  texture: WebGLTexture,
  y: number,
  width: number,
  rows: number,
  data: Float32Array,
): void {
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texSubImage2D(
    gl.TEXTURE_2D,
    0,
    0,
    y,
    width,
    rows,
    gl.RGBA,
    gl.FLOAT,
    data,
  );
}
