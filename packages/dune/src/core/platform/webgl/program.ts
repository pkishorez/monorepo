/*
 * Programs: a fragment shader linked to one fullscreen triangle, with
 * uniform locations looked up once.
 */

const VERTEX = `#version 300 es
in vec2 a_position;
out vec2 v_uv;
void main() {
  // (0,0) at the top left, as the DOM has it.
  v_uv = vec2(a_position.x * 0.5 + 0.5, 0.5 - a_position.y * 0.5);
  gl_Position = vec4(a_position, 0.0, 1.0);
}`;

/** A shader that failed to compile, with its log and the source by line. */
export class ShaderError extends Error {
  constructor(
    readonly label: string,
    readonly log: string,
    source: string,
  ) {
    const lines = source
      .split('\n')
      .map((line, i) => `${String(i + 1).padStart(4)} ${line}`)
      .join('\n');
    super(`${label}: ${log}\n${lines}`);
  }
}

const compile = (
  gl: WebGL2RenderingContext,
  type: number,
  source: string,
  label: string,
): WebGLShader => {
  const shader = gl.createShader(type)!;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS))
    throw new ShaderError(label, gl.getShaderInfoLog(shader) ?? '', source);
  return shader;
};

export type Program = {
  readonly program: WebGLProgram;
  /** A uniform's location, looked up once. */
  readonly uniform: (name: string) => WebGLUniformLocation | null;
};

/** Links a fragment shader to the fullscreen triangle's vertex shader. */
export const createProgram = (
  gl: WebGL2RenderingContext,
  fragment: string,
  label: string,
): Program => {
  const program = gl.createProgram();
  gl.attachShader(program, compile(gl, gl.VERTEX_SHADER, VERTEX, label));
  gl.attachShader(program, compile(gl, gl.FRAGMENT_SHADER, fragment, label));
  gl.bindAttribLocation(program, 0, 'a_position');
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS))
    throw new ShaderError(label, gl.getProgramInfoLog(program) ?? '', fragment);
  const cache = new Map<string, WebGLUniformLocation | null>();
  return {
    program,
    uniform: (name) => {
      if (!cache.has(name))
        cache.set(name, gl.getUniformLocation(program, name));
      return cache.get(name)!;
    },
  };
};

/** One triangle that covers the viewport, bound to attribute 0. */
export const createTriangle = (
  gl: WebGL2RenderingContext,
): WebGLVertexArrayObject => {
  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);
  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array([-1, -1, 3, -1, -1, 3]),
    gl.STATIC_DRAW,
  );
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  return vao;
};
