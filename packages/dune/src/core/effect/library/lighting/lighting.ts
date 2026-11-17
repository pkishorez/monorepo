import { color, defineEffect, num } from '../../define/index.ts';
import { LIGHT } from './light.glsl.ts';
import { SURFACE } from './surface.glsl.ts';

/*
 * A light that follows the pointer over HTML that has depth. Everything is
 * shown at `ambient` of its own brightness wherever the light is, so text
 * stays crisp and readable; the light only adds a highlight on top. It is
 * worked in linear light, and a colour too bright to show gives up chroma,
 * never hue: a lit orange stays orange, it doesn't turn yellow. Cards rise
 * off the floor, get bevelled edges and a specular sheen, and cast soft
 * shadows away from the light. Every Lamp adds its own coloured glow.
 */
export const lighting = defineEffect({
  name: 'Lighting',
  params: {
    intensity: num(0.9, 0, 4, 0.05),
    reach: num(420, 60, 1400, 10, 'reach (px)'),
    lift: num(160, 30, 600, 5, 'light height (px)'),
    ambient: num(0.7, 0, 1.5, 0.01, 'ambient (base light)'),
    raise: num(26, 0, 90, 1, 'card height (px)'),
    bevel: num(7, 1, 24, 0.5, 'bevel (px)'),
    depth: num(7, 0, 24, 0.5, 'normal depth'),
    emboss: num(0, 0, 1, 0.01),
    gloss: num(0.9, 0, 3, 0.05),
    shininess: num(48, 2, 200, 1),
    shadow: num(0.8, 0, 1, 0.01),
    haze: num(1, 0, 3, 0.05),
    light: color('#ffffff', 'light colour'),
    floor: color('#0c0e13', 'floor'),
  },
  prepare: SURFACE,
  glsl: LIGHT,
});
