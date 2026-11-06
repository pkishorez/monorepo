/*
 * What an effect can read, set by the engine before each pass: the
 * textures, the canvas's size, time, the pointer and the lamps.
 */

/** Presses remembered: the newest replaces the oldest. */
export const MAX_CLICKS = 8;
/** Lamps lit at once; any more are left dark. */
export const MAX_LAMPS = 8;

export const INPUTS = /* glsl */ `#version 300 es
precision highp float;
precision highp int;

uniform sampler2D u_html;      // the HTML's snapshot
uniform sampler2D u_source;    // what the previous effect drew, or the HTML
uniform float u_sourceFlip;    // 1 when u_source is a render target
uniform sampler2D u_memory;    // this effect's memory, if it has one
uniform sampler2D u_prepared;  // this effect's prepare() output, if it has one

uniform vec2 u_resolution;     // device pixels
uniform vec2 u_size;           // CSS pixels
uniform float u_dpr;
uniform float u_time;          // seconds, paused while hidden
uniform float u_delta;         // seconds since the last frame

uniform vec2 u_pointer;        // uv, eased
uniform vec2 u_pointerRaw;     // uv, as the pointer is
uniform vec2 u_velocity;       // uv per second
uniform float u_pointerDown;   // 1 while pressed
uniform float u_pointerInside; // eased 0..1
uniform vec3 u_press;          // xy uv of the last press, z its time (-1: none)

uniform vec4 u_clicks[${MAX_CLICKS}]; // xy uv, z press time, w 1 if set
uniform vec4 u_lamps[${MAX_LAMPS}];   // xy uv centre, zw half size in CSS px
uniform vec4 u_lampColors[${MAX_LAMPS}]; // rgb, a intensity
uniform float u_lampReach[${MAX_LAMPS}]; // CSS px
uniform int u_lampCount;
`;
