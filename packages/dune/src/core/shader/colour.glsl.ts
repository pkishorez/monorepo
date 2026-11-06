/**
 * Colour, premultiplied by alpha throughout. Light adds up in linear
 * light, so effects that light work there and turn back to sRGB to show;
 * OKLab keeps a hue while its chroma gives way.
 */
export const COLOUR = /* glsl */ `
float luma(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }

/** top over bottom, both premultiplied. */
vec4 over(vec4 top, vec4 bottom) { return top + bottom * (1.0 - top.a); }

/** An opaque colour, premultiplied. */
vec4 solid(vec3 c) { return vec4(c, 1.0); }

/** sRGB to linear light, where light adds up as it does in the world. */
vec3 toLinear(vec3 c) {
  c = clamp(c, 0.0, 1.0);
  return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(0.04045, c));
}

/** Linear light back to sRGB, to show. */
vec3 toSrgb(vec3 c) {
  c = clamp(c, 0.0, 1.0);
  return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c));
}

/** Linear sRGB to OKLab: lightness, then two axes whose angle is hue. */
vec3 oklab(vec3 c) {
  vec3 lms = mat3(
    0.4122214708, 0.2119034982, 0.0883024619,
    0.5363325363, 0.6806995451, 0.2817188376,
    0.0514459929, 0.1073969566, 0.6299787005
  ) * c;
  lms = sign(lms) * pow(abs(lms), vec3(1.0 / 3.0));
  return mat3(
    0.2104542553, 1.9779984951, 0.0259040371,
    0.7936177850, -2.4285922050, 0.7827717662,
    -0.0040720468, 0.4505937099, -0.8086757660
  ) * lms;
}

vec3 fromOklab(vec3 lab) {
  vec3 lms = mat3(
    1.0, 1.0, 1.0,
    0.3963377774, -0.1055613458, -0.0894841775,
    0.2158037573, -0.0638541728, -1.2914855480
  ) * lab;
  lms = lms * lms * lms;
  return mat3(
    4.0767416621, -1.2684380046, -0.0041960863,
    -3.3077115913, 2.6097574011, -0.7034186147,
    0.2309699292, -0.3413193965, 1.7076147010
  ) * lms;
}

/**
 * A linear colour brought inside what a screen can show, keeping its
 * lightness and hue and giving up only chroma (OKLCH). Clipping each
 * channel instead turns a bright orange yellow: red stops at 1 while
 * green keeps climbing.
 */
vec3 fitGamut(vec3 c) {
  if (all(lessThanEqual(c, vec3(1.0))) && all(greaterThanEqual(c, vec3(0.0))))
    return c;
  vec3 lab = oklab(c);
  if (lab.x >= 1.0) return vec3(1.0);
  if (lab.x <= 0.0) return vec3(0.0);
  float lo = 0.0, hi = 1.0;
  for (int i = 0; i < 10; i++) {
    float mid = 0.5 * (lo + hi);
    vec3 t = fromOklab(vec3(lab.x, lab.yz * mid));
    if (all(lessThanEqual(t, vec3(1.0))) && all(greaterThanEqual(t, vec3(0.0)))) lo = mid;
    else hi = mid;
  }
  return clamp(fromOklab(vec3(lab.x, lab.yz * lo)), 0.0, 1.0);
}
`;
