# hands

A playground for hand gestures in the browser: MediaPipe reads your hands from the camera, on the GPU, and a checklist lights up each gesture as you make it, published at hands.kishore.app.

## Big picture

A test of what in-browser hand tracking can do before building on it. The
camera, the model and every gesture stay in the browser; the site is one
Cloudflare Worker serving a static page, built on `@kestack/kabuki/start`
the way [`apps/kabuki-start`](../kabuki-start/README.md) is, and declared
with Alchemy. How Start works is in
[`packages/kabuki/docs/start.md`](../../packages/kabuki/docs/start.md).

MediaPipe's Gesture Recognizer (`@mediapipe/tasks-vision`) gives 21 points
per hand, up to two hands, and one of seven shapes: fist, open palm,
pointing up, thumbs up and down, victory, I love you. It runs on the GPU,
or on the CPU where the GPU will not start, from WASM this site serves
itself; the model file comes from Google's storage. Everything else is this
app's own math on the points, in `src/shared/gestures`: pinch and drag,
a pinch with the middle finger, counting fingers, swipes, a fist twisted
like a knob, a push toward the camera, drawing with the index finger, zoom
and rotate with both hands, and keeping each hand its letter, A or B, by
where it is. Points are smoothed with a One Euro filter, and every gesture
has separate thresholds to start and end it, so it fires once.

The app is one Actor, the Playground (`src/shared/pages/playground.ts`).
Its `On` State runs the Tracker as a Worker, so turning the camera off
interrupts it and lets the camera go; each gesture fired is a Message,
counted in the Model, and the checklist ticks it. The points, 30 times a
second, never are: the Tracker (`src/client/tracker`) hands each frame
straight to the stage (`src/client/stage`), a canvas with something for
each gesture to move: targets, a card, a square, a dial, slides and a list.

## Usage

### Find your way around

```
src/
  shared/
    gestures/          the Interpreter: frames in, readings and gestures out; the checklist's catalog; its tests
    tracker/           the Tracker Capability the Playground Requires
    pages/             the Playground, the app's one Actor, and the router
  client/
    app.tsx            Start.app: the router, the root View, the Document, the Tracker's Layer
    tracker/           camera, MediaPipe and the frame loop
    stage/             the canvas: what is on it, how gestures move it, how it is drawn; the readouts
    views/             the Playground's View, the checklist and the log
  server/
    loaders.server.ts  no Loaders: the page is static
  infra/               the site's Worker, its stage and its domain
```

### Run it

```sh
pnpm --filter hands dev     # alchemy dev behind Portless, at https://hands.kishore.computer
pnpm --filter hands test    # the Interpreter's tests, on synthetic hands
```

Open the page, press **Start the camera** and allow it. The camera needs
HTTPS or localhost. Each PR deploys a preview to `pr<N>-hands.kishore.app`
through `.github/workflows/deploy-hands.yml`, and `main` deploys
`hands.kishore.app`.
