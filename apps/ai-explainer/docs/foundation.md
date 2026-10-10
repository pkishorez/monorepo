# Foundation

What every Explainer shares. Each part is either decided by a Pick or still
open. An open part runs on the default listed and is decided by a Round.

| Part   | Now                                                       | Decided by         |
| ------ | --------------------------------------------------------- | ------------------ |
| Look   | web-platform's light theme, Inter, on a dotted board      | 01-look-and-motion |
| Voice  | Kokoro `am_michael` (Michael), speed 1.2                  | 02-voice           |
| Motion | One canvas: the camera travels between regions of a board | 01-look-and-motion |
| Sound  | narration only                                            | open               |
| Scenes | none: Explainers draw their own content on the canvas     | open               |

## Rules that always hold

- Movement comes only from the video frame (`useCurrentFrame`), never from the
  clock. The stage freezes CSS animations and transitions, so kui components
  appear in held states.
- Each Scene lasts exactly as long as its narration line.
- A Foundation change may break old Explainers. Keep them compiling; do not
  repair how they look or sound (ADR 0003).

## Look

- web-platform's light theme and real kui components, so Explainers look like
  the interfaces they sit next to.
- Everything is drawn on one dotted board. Each idea gets a region with a
  short title above it; text on screen stays short and never repeats the
  narrator.

## Motion

- One continuous drawing per Explainer (`defineCanvasExplainer`). Nothing is
  thrown away: each new idea is drawn in its own region, and lines connect it
  to the idea it grew from.
- The camera travels to the next region, pushes in on the one thing the
  narrator names, and pulls back. The recap pulls back to show the whole map.
- Highlight first, then move: a highlight lands before the camera follows it.
- Camera moves take about a second and ease in and out; arrivals take about
  0.7 seconds and settle.
- Still means still: between moves nothing drifts, because sub-pixel motion
  on a resting frame reads as jitter.
- A genuinely new idea gets a calm change (`FadeThrough`): the board fades to
  its background, the camera jumps while hidden, and the board fades back.

## Voice

- Kokoro's Michael: an American male voice, deep and steady, like a calm
  documentary narrator who knows the subject well.
- Speed 1.2. At 1 the narration dragged; above 1.3 Kokoro starts to clip.
- Only local Kokoro voices, no cloud voices.

## Where each part lives

- `src/foundation/stage`: the look every frame is painted on.
- `src/foundation/canvas`: the board, the camera and the timing of motion.
- `src/foundation/voice`: the narration voice.
- `src/foundation/explainer`: turns a script's voiceover and Scenes, or one
  canvas, into video.

When a Pick adds a part (sound, Scenes), it gets its own folder here and its
row above changes to the Round that decided it.
