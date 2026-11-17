/**
 * Lighting's effect(), every frame: the base light, the pointer's light
 * with its shadows and sheen, then each lamp's glow.
 */
export const LIGHT = /* glsl */ `
vec4 effect(vec2 uv) {
  vec4 base = source(uv);
  // In linear light, where light adds up; shown in sRGB at the end.
  vec3 albedo = toLinear(over(base, solid(p.floor)).rgb);
  vec3 tint = toLinear(p.light);
  vec4 surface = prepared(uv);
  vec3 n = surface.xyz;
  float h = surface.w;

  vec3 frag = vec3(toPx(uv), h * p.raise);
  vec3 lamp = vec3(toPx(u_pointer), p.lift);
  vec3 toLight = lamp - frag;
  float dist = length(toLight);
  vec3 l = toLight / dist;
  float atten = 1.0 / (1.0 + pow(dist / p.reach, 2.0));
  float strength = p.intensity * atten * mix(0.55, 1.0, u_pointerInside);

  // Soft shadow: march towards the light; anything taller than the ray dims it.
  float lit = 1.0;
  for (int i = 1; i <= 24; i++) {
    float t = float(i) / 24.0;
    vec3 q = mix(frag, lamp, t);
    float hq = html(toUv(q.xy)).a * p.raise;
    lit = min(lit, clamp(8.0 * (q.z - hq + 1.0) / (t * dist + 1.0) * 4.0, 0.0, 1.0));
  }
  float shade = mix(1.0 - p.shadow, 1.0, lit);

  float diffuse = max(dot(n, l), 0.0);
  vec3 halfway = normalize(l + vec3(0.0, 0.0, 1.0));
  // Mostly on the bevels: a flat top under the light would just blow out.
  float slope = smoothstep(0.0, 0.2, 1.0 - n.z);
  float spec = pow(max(dot(n, halfway), 0.0), p.shininess) * smoothstep(0.05, 0.6, h) * (0.08 + 0.92 * slope);

  // The light is an amount: it brightens each colour, it doesn't tint it.
  vec3 color = albedo * (p.ambient + diffuse * strength * shade * tint);
  color += spec * strength * tint * p.gloss * shade * 0.6;
  color += tint * strength * atten * 0.012 * p.haze * (1.0 - base.a * 0.7);

  // Lamps: each glowing element lights what is around it, in its colour.
  // A lamp is the light, not lit: it shows its own colour exactly.
  for (int i = 0; i < 8; i++) { // at most 8 lamps are lit
    if (i >= u_lampCount) break;
    vec2 centre = toPx(u_lamps[i].xy);
    vec2 halfSize = u_lamps[i].zw;
    float sd = sdRoundBox(toPx(uv) - centre, halfSize, min(halfSize.x, halfSize.y) * 0.5);
    float power = u_lampColors[i].a;
    vec3 glow = toLinear(u_lampColors[i].rgb) * power;
    float inside = smoothstep(1.5, -1.5, sd);
    float fall = exp(-max(sd, 0.0) / u_lampReach[i] * 3.0);
    vec3 dir = normalize(vec3(centre, p.raise + 30.0) - frag);
    color += albedo * glow * fall * (0.35 + max(dot(n, dir), 0.0)) * 1.1 * (1.0 - inside);
    color += glow * fall * fall * 0.045 * (1.0 - base.a);
    color = mix(color, albedo, inside);
  }
  // Too bright to show: scaled back whole, keeping hue and saturation,
  // with a touch of the shine a fit to the gamut in OKLCH gives.
  float peak = max(color.r, max(color.g, color.b));
  if (peak > 1.0) color = mix(color / peak, fitGamut(color), 0.2);
  return vec4(toSrgb(color), 1.0);
}
`;
