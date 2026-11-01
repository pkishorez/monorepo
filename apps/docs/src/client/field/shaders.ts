import { Kind, STORY, TIMING } from './shapes/index.ts';

/*
 * The GLSL. One draw places every particle: it reads where the particle sits
 * in the shape being left and the shape being reached, moves each as its
 * Motion says, sets both on screen, and blends between them by the scroll,
 * each particle a little before or after its neighbours. Nothing is kept
 * from frame to frame, so scrolling back is exact. A second draw paints
 * the comet and its trail.
 */

const f = (n: number) => n.toFixed(1);
const f3 = (n: number) => n.toFixed(3);

/** Colour is premultiplied, and its alpha always covers its colour, so
 * what the canvas holds is a picture every browser shows the same way. In
 * the dark the painter blends it additively, so light adds; in the light,
 * it is ink laid over paper. */
const COLOUR = /* glsl */ `
vec4 colour(float alpha, vec3 tint) {
  vec3 light = vec3(0.97) * tint;
  vec3 ink = vec3(0.075) + (tint - vec3(1.0)) * 0.4;
  vec3 c = mix(ink, light, uDark);
  return vec4(c * alpha, alpha * max(1.0, max(c.r, max(c.g, c.b))));
}
`;

export const PARTICLE_VERTEX = /* glsl */ `#version 300 es
precision highp float;
precision highp int;
precision highp sampler2D;

uniform sampler2D uPos;
uniform sampler2D uAux;
uniform int uWidth;
uniform int uRows;
uniform float uCount;

uniform int uLayerA;
uniform int uLayerB;
uniform mat3 uTurnA;
uniform mat3 uTurnB;
uniform vec3 uCenterA;
uniform vec3 uCenterB;
uniform float uScaleA;
uniform float uScaleB;
uniform vec3 uTintA;
uniform vec3 uTintB;
uniform float uGlowA;
uniform float uGlowB;
uniform float uBlend;

uniform float uTime;
uniform float uMotion;
uniform float uIntro;
uniform float uDark;
uniform float uSize;
uniform float uAspect;
uniform float uDistance;
uniform vec4 uComet;

out vec4 vColour;

const float PI = 3.14159265;

float hash(uint x) {
  x = x * 747796405u + 2891336453u;
  x = ((x >> ((x >> 28u) + 4u)) ^ x) * 277803737u;
  x = (x >> 22u) ^ x;
  return float(x) / 4294967295.0;
}

${COLOUR}

// 1 while loop is in the window from start for len, easing in and
// out over soft, all in loops; the window may wrap past the loop's end.
// Easings, as in shapes/pen/clock.ts.
float outCubic(float x) { float k = 1.0 - x; return 1.0 - k * k * k; }
float outQuart(float x) { float k = 1.0 - x; return 1.0 - k * k * k * k; }
float inCubic(float x) { return x * x * x; }
float inOutCubic(float x) {
  return x < 0.5 ? 4.0 * x * x * x : 1.0 - pow(2.0 - 2.0 * x, 3.0) / 2.0;
}
float inOutQuart(float x) {
  return x < 0.5 ? 8.0 * x * x * x * x : 1.0 - pow(2.0 - 2.0 * x, 4.0) / 2.0;
}
float outBack(float x) {
  float k = x - 1.0;
  return 1.0 + ${f3(TIMING.overshoot + 1)} * k * k * k + ${f3(TIMING.overshoot)} * k * k;
}
// A pop's swell, since seconds after it: up fast, down slowly.
float swell(float since) {
  if (since < ${f3(TIMING.rise)}) return outCubic(max(since, 0.0) / ${f3(TIMING.rise)});
  return 1.0 - inOutCubic(clamp((since - ${f3(TIMING.rise)}) / ${f3(TIMING.fall)}, 0.0, 1.0));
}

// A direction of its own for each point, on a sphere flattened towards
// the screen, so a scattered shape spreads as a round cloud.
vec3 away(float seed) {
  float a = seed * 6.2832 * 7.0;
  float z = fract(seed * 13.0) * 2.0 - 1.0;
  float r = sqrt(1.0 - z * z);
  return vec3(cos(a) * r, sin(a) * r, 0.4 * z);
}

float window(float loop, float start, float len, float soft) {
  float x = fract(loop - start);
  return smoothstep(0.0, soft, x) * (1.0 - smoothstep(len - soft, len, x));
}

// Moves a point of a formed shape as its Motion says; may change brightness.
void motion(inout vec3 p, inout float bright, vec4 aux, float seed) {
  float kind = floor(aux.x);
  float phase = fract(aux.x);
  float t = uTime;
  // The story clock; still, for a reader who asked for less motion, at a
  // moment where every story is told. As loopOf in shapes/pen/clock.ts.
  float story = mix(0.7, fract(t / ${f(STORY)}), uMotion);
  if (kind == ${f(Kind.flow)}) {
    float s = fract(t * 0.2 + phase);
    vec3 d = aux.yzw;
    p += d * s + vec3(0.0, sin(PI * s) * 0.22 * length(d), 0.0);
    bright *= smoothstep(0.0, 0.12, s) * (1.0 - smoothstep(0.86, 1.0, s));
  } else if (kind == ${f(Kind.orbit)}) {
    float a = t * aux.y;
    float c = cos(a), s = sin(a);
    p.xy = mat2(c, s, -s, c) * p.xy;
  } else if (kind == ${f(Kind.twinkle)}) {
    bright *= mix(1.0, 0.55 + 0.45 * sin(t * aux.y + phase * 6.2832), uMotion);
  } else if (kind == ${f(Kind.cycle)}) {
    // As loopOf in shapes/pen/clock.ts.
    float loop = mix(0.7, fract(t / aux.w), uMotion);
    if (phase < 0.25) {
      bright *= mix(0.38, 1.5, window(loop, aux.y, aux.z, 0.05));
    } else if (phase < 0.75) {
      float since = fract(loop - aux.y) * aux.w;
      bright *= 0.35 + 3.4 * smoothstep(0.0, 0.08, since) * exp(-since / 0.7);
    } else {
      bright *= mix(1.0, 0.22, window(loop, aux.y, aux.z, 0.05));
    }
  } else if (kind == ${f(Kind.reveal)}) {
    float g = clamp((story - aux.z) / max(aux.w, 0.02), 0.0, 1.0);
    float lit = 1.0 - smoothstep(g - 0.02, g, aux.y);
    float fade = 1.0 - smoothstep(0.82, 0.95, story);
    p += away(seed) * (1.0 - fade) * lit * 0.18;
    bright *= mix(phase, 1.0, lit * fade);
  } else if (kind == ${f(Kind.message)}) {
    // How far past this point the head is, in laps: ahead of it, the
    // head's own bright edge; behind it, the tail it leaves.
    float past = fract(t * aux.z + phase - aux.y + 0.5) - 0.5;
    float w = aux.w;
    float boost = past < 0.0 ? exp(-past * past / (w * w)) : exp(-past / (w * 3.0));
    bright *= mix(0.85, 0.45 + 3.2 * boost, uMotion);
  } else if (kind == ${f(Kind.arrive)}) {
    float since = fract(t * aux.z + phase - aux.y);
    float flare = exp(-since / aux.w) * smoothstep(0.0, 0.01, since);
    bright *= mix(1.0, 0.8 + 2.2 * flare, uMotion);
  } else if (kind == ${f(Kind.travel)} || kind == ${f(Kind.glide)}) {
    // As travelled in shapes/pen/clock.ts: a Message leaves fast and
    // slows into where it lands; a marker eases out and brakes in.
    float len = fract(aux.w);
    float move = floor(aux.w) / 1000.0;
    float x = fract(story - phase);
    float soft = ${f3(TIMING.handoff)};
    float on = smoothstep(0.0, soft, x) * (1.0 - smoothstep(len, len + soft, x));
    float u = clamp((x - (len - move)) / move, 0.0, 1.0);
    float s = kind == ${f(Kind.travel)} ? outQuart(u) : inOutQuart(u);
    p.xy += aux.yz * s;
    if (kind == ${f(Kind.travel)}) p.y += aux.y * 0.3 * sin(PI * s);
    bright *= on;
  } else if (kind == ${f(Kind.gather)}) {
    // As gathered in shapes/pen/clock.ts: in fast from all round, a touch
    // past its place and back; out quicker, accelerating away.
    float x = fract(story - phase);
    float len = aux.y;
    float enter = clamp(x / ${f3(TIMING.enter)}, 0.0, 1.0);
    float leave = clamp((x - len) / ${f3(TIMING.leave)}, 0.0, 1.0);
    float here = x < len ? outBack(enter) : 1.0 - inCubic(leave);
    float lit = x < len ? outCubic(enter) : 1.0 - inCubic(leave);
    p += away(seed) * aux.z * (0.3 + 0.7 * fract(seed * 29.0)) * (1.0 - here);
    bright *= lit;
  } else if (kind == ${f(Kind.pop)}) {
    // As popped in shapes/pen/clock.ts: swells round its centre and
    // brightens, quick in and slow out, repeats times a loop.
    float repeats = floor(aux.w);
    float since = mod(fract(story - phase), 1.0 / repeats) * ${f(STORY)};
    float e = swell(since) * uMotion;
    p.xy = aux.yz + (p.xy - aux.yz) * (1.0 + fract(aux.w) * e);
    bright *= 1.0 + 1.8 * e;
  } else if (kind == ${f(Kind.ripple)}) {
    // A ring that runs out from its centre and fades, as a pop goes off.
    float repeats = floor(aux.w);
    float since = mod(fract(story - phase), 1.0 / repeats) * ${f(STORY)};
    float u = since / ${f3(TIMING.ripple)};
    p.xy = aux.yz + (p.xy - aux.yz) * (1.0 + fract(aux.w) * 4.0 * outCubic(min(u, 1.0)));
    bright *= u < 1.0 ? (1.0 - u) * (1.0 - u) * smoothstep(0.0, 0.04, u) * uMotion : 0.0;
  } else if (kind == ${f(Kind.stream)}) {
    // Light runs the length of a line, easing in and out, repeats times
    // a loop: a bright head, a tail behind it, then gone as it lands.
    float cycle = 1.0 / aux.w;
    float x = mod(fract(story - phase), cycle);
    float g = inOutCubic(clamp(x / aux.z, 0.0, 1.0));
    float d = g - aux.y;
    float head = d < 0.0 ? exp(-d * d / 0.0016) : exp(-d / 0.12);
    head *= 1.0 - smoothstep(aux.z, aux.z + 0.03, x);
    bright *= mix(1.0, 0.45 + 3.0 * head, uMotion);
  }
}

void main() {
  int id = gl_VertexID;
  ivec2 at = ivec2(id % uWidth, id / uWidth);
  vec4 pa = texelFetch(uPos, at + ivec2(0, uLayerA * uRows), 0);
  vec4 xa = texelFetch(uAux, at + ivec2(0, uLayerA * uRows), 0);
  vec4 pb = texelFetch(uPos, at + ivec2(0, uLayerB * uRows), 0);
  vec4 xb = texelFetch(uAux, at + ivec2(0, uLayerB * uRows), 0);
  float seed = hash(uint(id));
  float seed2 = hash(uint(id) + 7919u);

  // Each particle's own moment in the morph: a sweep, loosened by chance.
  // Wide enough that a shape builds across as the page scrolls, some of
  // it landing while the rest is still on its way, rather than all of it
  // in flight at once as a fog; and every particle has landed at the end.
  float delay = 0.75 * (float(id) / uCount) + 0.25 * seed;
  float spread = 0.42;
  float m = clamp((uBlend - delay * spread) / (1.0 - spread), 0.0, 1.0);
  m = m * m * (3.0 - 2.0 * m);

  vec3 la = pa.xyz;
  float ba = pa.w;
  motion(la, ba, xa, seed);
  vec3 lb = pb.xyz;
  float bb = pb.w;
  motion(lb, bb, xb, seed);
  vec3 ra = uTurnA * la;
  vec3 rb = uTurnB * lb;
  vec3 w = mix(uCenterA + ra * uScaleA, uCenterB + rb * uScaleB, m);
  float glow = mix(uGlowA, uGlowB, m);
  float bright = mix(ba, bb, m) * (1.0 + 0.4 * glow);
  float depth = mix(ra.z, rb.z, m);
  vec3 tint = mix(uTintA, uTintB, m);
  float scale = mix(uScaleA, uScaleB, m);

  // In flight, a particle drifts on a slow current and lifts towards the
  // reader; formed, it barely breathes.
  float flight = sin(PI * m);
  vec3 q = w * 1.7 + seed * 4.0;
  float tt = uTime;
  vec3 current = vec3(
    sin(q.y * 1.9 + tt * 0.37) + sin(q.z * 2.3 - tt * 0.29),
    sin(q.z * 2.1 + tt * 0.31) + sin(q.x * 1.7 + tt * 0.23),
    sin(q.x * 2.2 - tt * 0.27) + sin(q.y * 1.6 + tt * 0.33)
  ) * 0.5;
  w += current * scale * (0.004 * uMotion + 0.055 * flight * mix(0.4, 1.0, uMotion));
  w.z += flight * (seed2 - 0.35) * 0.22 * scale;

  // The first gathering: from scattered far and wide into the shape.
  if (uIntro < 1.0) {
    float k = clamp((uIntro - seed * 0.45) / 0.55, 0.0, 1.0);
    k = 1.0 - pow(1.0 - k, 3.0);
    vec3 dir = normalize(vec3(hash(uint(id) + 11u), hash(uint(id) + 23u), hash(uint(id) + 37u)) - 0.5 + 1e-4);
    vec3 far = uCenterA + dir * (0.9 + 1.6 * seed2) * vec3(max(uAspect, 1.0), 1.0, 0.6);
    w = mix(far, w, k);
    bright *= k;
  }

  // The comet pulls those it passes in close, swirls them, and lights
  // them: brightly near its head, faintly a little further out.
  vec3 dc = uComet.xyz - w;
  float reach = length(dc);
  float near = exp(-reach * reach / 0.03) * uComet.w;
  float wake = exp(-reach * reach / 0.12) * uComet.w;
  w += dc * near * 0.08 + cross(dc, vec3(0.0, 0.0, 1.0)) * near * 0.1;
  bright += near * (0.5 + bright) * 1.3 + wake * bright * 0.5;
  // While the comet holds at a shape, a soft ripple runs out from it
  // across the shape, every few seconds.
  float ripple = fract(uTime * 0.28);
  float front = (reach - ripple * 1.5 * scale) / (0.07 * scale);
  bright *= 1.0 + 1.1 * exp(-front * front) * (1.0 - ripple) * glow * uMotion;

  float wv = uDistance - w.z;
  gl_Position = vec4(w.x * uDistance / uAspect, w.y * uDistance, 0.0, wv);
  if (wv < 0.3) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);

  float fade = mix(0.5, 1.12, smoothstep(-1.0, 1.0, depth));
  float size = uSize * (uDistance / wv) * (0.7 + 0.3 * min(bright, 3.0));
  // Below a pixel a point flickers: keep it a pixel, and fainter instead.
  float sub = clamp(size, 0.0, 1.0);
  gl_PointSize = clamp(size, 1.0, 40.0);
  float alpha = clamp(0.5 * bright * fade * sub, 0.0, 1.0);
  vColour = colour(alpha, tint);
}
`;

export const PARTICLE_FRAGMENT = /* glsl */ `#version 300 es
precision highp float;
in vec4 vColour;
out vec4 outColour;
void main() {
  vec2 c = gl_PointCoord * 2.0 - 1.0;
  float r = dot(c, c);
  if (r > 1.0) discard;
  float soft = 1.0 - r;
  outColour = vColour * soft * soft;
}
`;

/** The comet's head: a wide bloom, a soft halo, then a crisp core. */
export const HEAD_VERTEX = /* glsl */ `#version 300 es
precision highp float;
in vec4 aPoint;
uniform float uDark;
uniform float uSize;
uniform float uAspect;
uniform float uDistance;
uniform float uStrength;
out vec4 vColour;
out float vSharp;
out float vCore;
${COLOUR}
void main() {
  vec3 w = aPoint.xyz;
  float wv = uDistance - w.z;
  gl_Position = vec4(w.x * uDistance / uAspect, w.y * uDistance, 0.0, wv);
  float persp = uDistance / wv;
  bool core = aPoint.w > 2.5;
  bool bloom = aPoint.w < 1.5;
  float size = core ? 11.0 : bloom ? 150.0 : 72.0;
  // Ink cannot glow on paper: there the halo is a faint shadow.
  float alpha = core ? 1.0 : bloom ? mix(0.05, 0.16, uDark) : mix(0.2, 0.55, uDark);
  vSharp = core ? 1.5 : bloom ? 3.0 : 4.5;
  vCore = core ? 1.0 : 0.0;
  gl_PointSize = size * uSize * persp;
  vColour = colour(alpha * uStrength, vec3(1.0));
}
`;

export const HEAD_FRAGMENT = /* glsl */ `#version 300 es
precision highp float;
in vec4 vColour;
in float vSharp;
in float vCore;
out vec4 outColour;
void main() {
  vec2 c = gl_PointCoord * 2.0 - 1.0;
  float r = dot(c, c);
  if (r > 1.0) discard;
  // The core is a solid disc with a soft rim; the halo, a gaussian.
  float core = 1.0 - smoothstep(0.45, 1.0, r);
  float halo = exp(-r * vSharp) * (1.0 - r);
  outColour = vColour * mix(halo, core, vCore);
}
`;

/**
 * The comet's trail: a ribbon in screen space, as wide as a few pixels at
 * the head and narrowing to nothing, fading as it goes.
 */
export const TRAIL_VERTEX = /* glsl */ `#version 300 es
precision highp float;
in vec4 aPoint;
in vec4 aNext;
uniform float uDark;
uniform float uSize;
uniform float uAspect;
uniform float uDistance;
uniform float uStrength;
uniform vec2 uResolution;
out vec4 vColour;
out float vAcross;
${COLOUR}
vec4 project(vec3 w) {
  return vec4(w.x * uDistance / uAspect, w.y * uDistance, 0.0, uDistance - w.z);
}
void main() {
  float age = aPoint.w;
  float side = aNext.w;
  vec4 here = project(aPoint.xyz);
  vec4 there = project(aNext.xyz);
  vec2 half_ = uResolution * 0.5;
  vec2 a = here.xy / here.w * half_;
  vec2 b = there.xy / there.w * half_;
  vec2 d = b - a;
  d = length(d) < 1e-4 ? vec2(1.0, 0.0) : normalize(d);
  vec2 across = vec2(-d.y, d.x);
  float persp = uDistance / here.w;
  float taper = pow(1.0 - age, 0.8);
  // Thick at the head, and never thinner than a hairline on its way out.
  float width = (1.0 + 5.0 * taper) * uSize * persp;
  vec2 offset = across * side * width * 0.5 / half_;
  gl_Position = vec4((here.xy / here.w + offset) * here.w, 0.0, here.w);
  vAcross = side;
  float alpha = pow(1.0 - age, 1.3) * mix(0.9, 0.85, uDark);
  vColour = colour(alpha * uStrength, vec3(1.0));
}
`;

export const TRAIL_FRAGMENT = /* glsl */ `#version 300 es
precision highp float;
in vec4 vColour;
in float vAcross;
out vec4 outColour;
void main() {
  float edge = 1.0 - smoothstep(0.35, 1.0, abs(vAcross));
  outColour = vColour * edge;
}
`;
