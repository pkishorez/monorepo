# Walkthroughs are recorded Storyboards

A Walkthrough's picture is not drawn in Remotion. Its Storyboard is a page in
the docs app that shows each beat in one frame, code beside the live app, and
`pnpm record` plays that page on the voiceover's timing and records it at 60
fps. Remotion only mixes the sound, which `pnpm render` lays under the
recording.

The first Walkthrough drew a board in Remotion with recorded clips placed on
it, and a camera moving between them. It felt cut up: the camera moved too
much, and each clip was a separate take of the app. Drawing the app itself in
Remotion would keep it frame-exact, but the demo's motion runs on real time
(Motion springs and Effect Lifetimes), which Remotion's frame-by-frame render
cannot drive. Recording one continuous take keeps every animation as it
really runs, and the Storyboard the user reviews is the very thing recorded.

## Consequences

- The picture is only as steady as the recording: record against a
  production build of the docs app, never the dev server, whose hot reloads
  reset the page.
- Narration and picture share one timing (`src/foundation/walkthrough`):
  every new voiceover needs a new recording.
- Remotion's 24 fps does not touch a Walkthrough's picture.
