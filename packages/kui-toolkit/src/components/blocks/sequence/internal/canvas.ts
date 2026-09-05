/**
 * The internal coordinate space scenes are authored in. {@link BASE_W} is the
 * *reference* width (1920) and anchors the unit so a value written today renders
 * the same physical proportion at any size. The design height is configurable
 * per-`<Screen>` via its `aspect` prop ({@link BASE_H}/1080 is just the 16:9
 * default); the width stays fixed.
 *
 * Scenes are NOT scaled by a transform. Instead the stage is sized fluidly and a
 * **live unit** (px per 1% of the stage width) is measured from the real
 * container, so every element renders at its true on-screen size. That is
 * exactly what `motion`'s layout projection needs: `getBoundingClientRect`
 * reports real pixels and corrections apply in the same space, so there is no
 * scale-induced drift and `layout`/`layoutId` animations stay smooth. (A CSS
 * `zoom`/`transform: scale` ancestor breaks this — the reported box and the
 * correction space disagree and elements visibly jitter.)
 */
export const BASE_W = 1920;

/** Default reference height — the 16:9 counterpart to {@link BASE_W}. */
export const BASE_H = 1080;

/** Vertical room reserved for surrounding chrome when fitting to viewport height. */
export const HEIGHT_MARGIN = 220;

/**
 * Canvas-relative length helpers bound to a measured unit. `cw(n)` is "n% of the
 * stage width" in real px; `ch(n)` is the height-axis counterpart (it keeps the
 * owning `<Screen>`'s `baseH/BASE_W` ratio so a square authored as
 * `cw(x)`/`ch(x)` is not distorted, whatever the configured aspect).
 *
 * Built per-render by {@link makeCanvas} and handed to a step's `render` as its
 * second argument — they are bound to *that* `<Screen>`'s live unit, so there is
 * no module-global state two Screens could clobber. Use the inherited `--u` CSS
 * variable (which equals `cw(1)`) for static styles, and these for values
 * `motion` animates (which can't interpolate `calc(var(--u))` strings).
 */
export type Canvas = {
  /** Live unit: px per 1% of stage width (`cw(1)`). */
  u: number;
  cw: (pct: number) => number;
  ch: (pct: number) => number;
};

export const makeCanvas = (u: number, baseH: number = BASE_H): Canvas => ({
  u,
  cw: (pct) => pct * u,
  ch: (pct) => pct * u * (baseH / BASE_W),
});
