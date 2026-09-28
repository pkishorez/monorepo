# Foundation

What every Explainer shares. Each part is either decided by a Pick or still
open. An open part runs on the default listed and is decided by a Round.

| Part   | Now                                  | Decided by |
| ------ | ------------------------------------ | ---------- |
| Look   | ui-toolkit's light theme, Inter      | open       |
| Voice  | Kokoro `af_heart`, speed 1           | open       |
| Motion | none: Scenes appear without movement | open       |
| Sound  | narration only                       | open       |
| Scenes | none: Explainers use draft Scenes    | open       |

## Rules that always hold

- Movement comes only from the video frame (`useCurrentFrame`), never from the
  clock. The stage freezes CSS animations and transitions, so kui components
  appear in held states.
- Each Scene lasts exactly as long as its narration line.
- A Foundation change may break old Explainers. Keep them compiling; do not
  repair how they look or sound (ADR 0003).

## Where each part lives

- `src/foundation/stage`: the look every frame is painted on.
- `src/foundation/voice`: the narration voice.
- `src/foundation/explainer`: turns a script's voiceover and Scenes into video.

When a Pick adds a part (motion, sound, Scenes), it gets its own folder here
and its row above changes to the Round that decided it.
