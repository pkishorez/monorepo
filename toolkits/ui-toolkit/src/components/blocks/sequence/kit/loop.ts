/**
 * A looping decorative transition — continuous, ambient motion (a pulse, a
 * twinkle) that runs independently of step playback. This is the one sanctioned
 * exception to "presets only": decorative loops are NOT step transitions, so
 * they neither inherit `<Screen speed>` nor come from an enter/exit preset.
 *
 * Spread onto an element's `transition` (often per-property), pairing a looping
 * `animate` array with it:
 *
 * ```tsx
 * <Div animate={{ scale: [1, 1.16, 1] }} transition={loop(1.4, stagger(i))} />
 * ```
 */
export const loop = (duration: number, extra: object = {}) => ({
  duration,
  repeat: Infinity,
  ease: 'easeInOut' as const,
  ...extra,
});
