/** Reading the textures, and moving between uv and CSS pixels. */
export const READ = /* glsl */ `
/** The HTML at uv. */
vec4 html(vec2 uv) { return texture(u_html, uv); }

/** What the previous effect drew at uv: the HTML for the first effect. */
vec4 source(vec2 uv) {
  return texture(u_source, u_sourceFlip > 0.5 ? vec2(uv.x, 1.0 - uv.y) : uv);
}

/** Memory: last frame's in update(), this frame's in effect(). */
vec4 previous(vec2 uv) { return texture(u_memory, vec2(uv.x, 1.0 - uv.y)); }
vec4 memory(vec2 uv) { return texture(u_memory, vec2(uv.x, 1.0 - uv.y)); }

/** What prepare() wrote at uv: computed once per change of the HTML or params. */
vec4 prepared(vec2 uv) { return texture(u_prepared, vec2(uv.x, 1.0 - uv.y)); }

/** One CSS pixel, in uv. */
vec2 pxUv() { return 1.0 / u_size; }

/** uv to CSS pixels, and back. */
vec2 toPx(vec2 uv) { return uv * u_size; }
vec2 toUv(vec2 px) { return px / u_size; }

/** Wider-than-tall uv, so circles stay round. */
vec2 square(vec2 uv) { return vec2(uv.x * u_size.x / u_size.y, uv.y); }

/** How much HTML is near uv: its alpha blurred over radius CSS px. */
float coverage(vec2 uv, float radius) {
  float sum = html(uv).a;
  vec2 r = radius * pxUv();
  // A golden-angle spiral: 12 taps that cover the disc evenly.
  for (int i = 1; i <= 12; i++) {
    float t = float(i) / 12.0;
    float a = float(i) * 2.39996323;
    sum += html(uv + vec2(cos(a), sin(a)) * r * sqrt(t)).a;
  }
  return sum / 13.0;
}
`;
