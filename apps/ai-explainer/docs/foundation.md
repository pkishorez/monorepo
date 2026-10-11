# Foundation

What every Explainer and Walkthrough shares. Each part is either decided by a Pick or still
open. An open part runs on the default listed and is decided by a Round.

| Part    | Now                                                                                   | Decided by                                |
| ------- | ------------------------------------------------------------------------------------- | ----------------------------------------- |
| Visuals | web-platform's light theme, Inter, on a dotted board                                  | 01-look-and-motion                        |
| Voice   | Gemini `Charon`, read as a calm teacher; Kokoro Michael as the fallback               | 02-voice, then the Effect Oak Walkthrough |
| Motion  | One canvas: the camera travels between regions of a board                             | 01-look-and-motion                        |
| Sound   | Explainers: narration only. Walkthroughs: music for the opening and the close, clicks | open                                      |
| Scenes  | none: Explainers draw their own content on the canvas                                 | open                                      |

## Rules that always hold

- Movement comes only from the video frame (`useCurrentFrame`), never from the
  clock. The stage freezes CSS animations and transitions, so kui components
  appear in held states.
- Each Scene lasts exactly as long as its narration line.
- A Foundation change may break old Explainers. Keep them compiling; do not
  repair how they look or sound (ADR 0003).

## Visuals

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

- Gemini's Charon (`gemini-3.8-flash-tts`), told before every line to read
  like a calm, friendly teacher walking a developer through code. The key is
  `GEMINI_API_KEY`, in the environment or in the app's git-ignored `.env`.
- `pnpm voiceover <name> kokoro` speaks with the local Kokoro Michael
  instead, at speed 1.05: for when Gemini is out of reach.
- Every line is levelled to -18 LUFS when it is spoken, so music and effects
  can sit at fixed levels under it.
- The engines sit behind one file, `scripts/speak.ts`, and their settings in
  `src/foundation/voice`.

## Sound

- Every sound is synthesised by `pnpm sound` from ffmpeg formulas: nothing is
  downloaded or licensed. The files are small and committed, like voiceovers.
- The music bed is a warm 32-second loop of four chords in D. Under an
  Explainer it rests about 24 dB under the voice and rises a little in
  silences; a Walkthrough plays it under the opening title, lets it go a
  second before the first line, and brings it back for the close.
- Effects are soft and few: a whoosh on each camera move (louder for longer
  moves), a click on every recorded click, a swell that peaks on a moment, a
  chime on the end card.
- `pnpm render` normalises the finished mix to -14 LUFS, true peaks under
  -1.5 dBTP, the level social players expect.

## Walkthroughs

A Walkthrough is not drawn in Remotion: its picture is its Storyboard, a page
in the docs app, recorded live.

- The Storyboard frame is 1280×720 with no borders: code coloured by Shiki on
  the left, the running app on the right; for Time Travel the app moves left
  and its devtools slide in. Each chapter's title rises in the middle, then
  settles in the corner.
- `pnpm record <name>` plays the Storyboard beat by beat on the voiceover's
  timing, does each beat's Take with a visible cursor, and records the whole
  run at 60 fps into `public/recordings/<name>.mp4` (git-ignored), with
  `<name>.json` beside it: `{ "seconds": number, "clicks": number[] }`.
- The timing is shared: a beat lasts its lead, its line and its rest, or its
  Take's `hold` if that is longer. The first beat of a chapter waits longer,
  for its title.
- `pnpm render <name>` mixes only the sound in Remotion (voice, music,
  clicks, the chime) and lays it under the recording, so the picture keeps
  its 60 fps.

## Where each part lives

- `src/foundation/stage`: the page every frame is painted on.
- `src/foundation/canvas`: the board, the camera and the timing of motion.
- `src/foundation/voice`: the narration voices.
- `src/foundation/explainer`: turns a script's voiceover and Scenes, or one
  canvas, into video, and holds the timeline every video shares.
- `src/foundation/walkthrough`: a Walkthrough's timing, what its Takes can
  do, and the video around its recording.
- `src/foundation/footage`: the recording, or a placeholder until it exists.
- `src/foundation/sound`: the music bed and effects, made by `pnpm sound`.

When a Pick adds a part (sound, Scenes), it gets its own folder here and its
row above changes to the Round that decided it.
