/**
 * Lighting's prepare(): the HTML's height and surface direction. Its
 * alpha, softened over `bevel`, is a height map, so cards rise off the
 * floor with rounded edges. 65 texture reads a pixel, so it is worked out
 * once per change of the HTML, not once per frame.
 *
 * Emboss raises bright pixels, text mostly. It is off by default: the map
 * is drawn at half size, and shading glyphs from it pixelates them.
 */
export const SURFACE = /* glsl */ `
float heightAt(vec2 uv) {
  vec4 c = html(uv);
  float tone = c.a > 0.0 ? luma(c.rgb / c.a) - 0.5 : 0.0;
  return coverage(uv, p.bevel) + p.emboss * c.a * tone;
}

vec4 prepare(vec2 uv) {
  vec2 e = pxUv() * 2.0;
  float h = heightAt(uv);
  float hl = heightAt(uv - vec2(e.x, 0.0));
  float hr = heightAt(uv + vec2(e.x, 0.0));
  float hu = heightAt(uv - vec2(0.0, e.y));
  float hd = heightAt(uv + vec2(0.0, e.y));
  vec3 n = normalize(vec3((hl - hr) * p.depth, (hu - hd) * p.depth, 1.0));
  return vec4(n, h);
}
`;
