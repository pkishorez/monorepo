# Foundation

What every Explainer and Walkthrough shares. Each part is either decided by a Pick or still
open. An open part runs on the default listed and is decided by a Round.

| Part   | Now                                                                    | Decided by         |
| ------ | ---------------------------------------------------------------------- | ------------------ |
| Look   | web-platform's light theme, Inter, on a dotted board                   | 01-look-and-motion |
| Voice  | Kokoro `am_michael` (Michael), speed 1.2                               | 02-voice           |
| Motion | One canvas: the camera travels between regions of a board              | 01-look-and-motion |
| Sound  | Explainers: narration only. Walkthroughs: a music bed and soft effects | open               |
| Scenes | none: Explainers draw their own content on the canvas                  | open               |
| Styles | Walkthroughs only: blueprint, paper or bold, one per render            | open (Effect Oak)  |

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
- Every line is levelled to -18 LUFS when it is spoken, so music and effects
  can sit at fixed levels under it.
- The engine sits behind one file, `scripts/speak.ts`. Changing engines
  rewrites that file and the settings in `src/foundation/voice`, nothing else.

## Sound

- Every sound is synthesised by `pnpm sound` from ffmpeg formulas: nothing is
  downloaded or licensed. The files are small and committed, like voiceovers.
- The music bed is a warm 32-second loop of four chords in D. It rests about
  24 dB under the voice and rises a little in silences.
- Effects are soft and few: a whoosh on each camera move (louder for longer
  moves), a click on every recorded click, a swell that peaks on a moment, a
  chime on the end card.

## Walkthroughs

A Walkthrough (`defineWalkthrough`) is one canvas like an Explainer's, plus:

- recorded footage of the live app, played from `public/recordings/<look>/<clip>.mp4`
  (git-ignored, made by a recorder) and timed by the `<clip>.json` beside it,
  `{ "seconds": number, "clicks": number[] }`. A clip longer than its window
  plays up to twice as fast. A clip not recorded yet shows a labelled
  placeholder, so a Walkthrough can be built and timed first;
- code cards that show real source, coloured by Shiki, with a highlight that
  travels from block to block as the narrator names them, and a type error
  drawn with a red squiggle;
- burned-in captions from the script, at most two lines;
- title and section cards, the music bed and effects;
- three Styles, each its own composition (`<id>-<style>`); the recordings'
  Look is a prop.

Silence is part of a Walkthrough's timing: `pauses` give seconds before a
line, so the app gets time to run between lines.

## Where each part lives

- `src/foundation/stage`: the look every frame is painted on.
- `src/foundation/canvas`: the board, the camera and the timing of motion.
- `src/foundation/voice`: the narration voice.
- `src/foundation/explainer`: turns a script's voiceover and Scenes, or one
  canvas, into video, and holds the timeline every video shares.
- `src/foundation/walkthrough`: turns a voiceover, a camera path and one
  canvas into a Walkthrough, one video per Style.
- `src/foundation/style`: the Styles.
- `src/foundation/footage`: recorded clips and their placeholders.
- `src/foundation/code`: code cards.
- `src/foundation/captions`: burned-in captions.
- `src/foundation/cards`: title cards and chapter labels.
- `src/foundation/sound`: the music bed and effects, made by `pnpm sound`.

When a Pick adds a part (sound, Scenes), it gets its own folder here and its
row above changes to the Round that decided it.
