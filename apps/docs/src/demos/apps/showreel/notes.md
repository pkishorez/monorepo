# Showreel

Status: works

## What it is

The Storyboard of the Effect Oak Walkthrough: every beat in order, with what
the narrator says and what happens on screen. Play any beat in its 1280×720
frame and step through the rest with the arrow keys.

```
script.ts   the beats: what is said and shown. The video speaks this file.
beats.ts    what the frame shows in each beat: code, lit lines, which app
code.ts     Shiki colouring and cutting code from the demo's sources
frame.tsx   the frame: code beside the app, or the app beside its devtools
showreel.tsx the page, and `?record=1`, the frame alone for the recorder
```

`?record=1` draws only the frame and exposes `window.showreel.go(id)`;
`pnpm record effect-oak` in the AI Explainer app (now in the private `mine` repo, `apps/ai-explainer`) drives it.

## Blockers

None.
