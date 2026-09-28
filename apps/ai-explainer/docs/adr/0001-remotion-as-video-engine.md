# Remotion as the video engine

Videos are rendered with Remotion so that real ui-toolkit React components
can appear on screen, and so the Playground can embed live previews through
`@remotion/player`. HyperFrames was the stronger fit for agent-written HTML
and ships built-in text-to-speech and captions, but it cannot host React
components without an extra build step and was pre-1.0 (September 2026).
Motion (motion.dev) was rejected as an engine because it cannot render video
on its own.

## Consequences

- Every on-screen movement is driven by the video frame, never the clock. kui
  components appear in held states; their own `motion`, CSS transition, and
  `tw-animate` effects do not run in renders.
- Remotion bundles with webpack, not the monorepo's Vite+.
- The Remotion license is free for an individual and for companies of up to
  three people; a larger company needs a paid Company License.
