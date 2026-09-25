# stt

Browser-only speech-to-text demo where button presses inject context at the exact moment they were spoken, transcribed on WebGPU with no server.

## Big picture

Dictation tools give you words. This demo gives you words plus the things you
pointed at while saying them. You speak, press a context button mid-sentence,
and the button's content lands between the words you were saying at that
instant, even though the transcript itself arrives a second or two behind you.
It lives at [stt.kishore.app](https://stt.kishore.app).

The trick is that presses are timed on the audio clock, never on text. The
speech model (Whisper or NVIDIA Parakeet) re-transcribes a rolling window of
recent audio and returns each word with its time, so a press can be placed after the words that had started by then,
and the transcript settles from provisional (dim) to final around it. The
vocabulary (session, injection, placement, provisional word) is defined in
[CONTEXT.md](./CONTEXT.md).

Everything runs in the tab: the microphone feeds a 16 kHz recording through an
AudioWorklet, a Web Worker runs the chosen model behind an Effect RPC protocol,
and an Effect session folds words and presses into segments. Models plug in
under `src/engine/models`, one folder per library: Whisper through
`@huggingface/transformers`, Parakeet through `parakeet.js`. Model files come
down through `src/engine/downloads`, which keeps them in Cache Storage in
16 MB pieces, so a reload resumes a download instead of restarting it. There
is no fallback: no WebGPU, no demo. `src/engine` is the
reusable part and depends on nothing in the page; `laymos.config.json`
declares that boundary so it can be lifted into a package later. The page is a
TanStack Start app on a Cloudflare Worker built with `kui-toolkit`,
`use-effect-ts` and Motion.

## Usage

### Run locally

`pnpm dev` starts the Alchemy dev server through Portless under the
`stt.kishore` name from `portless.json`. Open the printed URL in a WebGPU
browser (recent Chrome or Edge), pick a model, wait for the download, press
Transcribe and speak. The page is cross-origin isolated (COOP and COEP headers
in `vite.config.ts`, `src/server.ts` and `public/_headers`) so the CPU
Parakeet build can run on several threads. Keys 1 to 3 press the context buttons without leaving
the microphone.

```bash
pnpm --filter stt dev      # dev server
pnpm --filter stt lint     # vp check + tsc --noEmit + laymos lint
pnpm --filter stt test     # vitest: placement and rolling-window rules
pnpm --filter stt build    # vp build -> dist/
```

### Reuse the engine

The engine's door is `src/engine/session`. Build one session per page inside
a scope; it spawns the worker and owns the microphone.

```ts
import { Context, Layer } from 'effect';
import {
  makeVoiceSession,
  type VoiceSessionService,
} from './engine/session/index.ts';

interface MyPayload {
  readonly label: string;
  readonly text: string;
}

class MySession extends Context.Service<
  MySession,
  VoiceSessionService<MyPayload>
>()('MySession') {}

const layer = Layer.effect(MySession, makeVoiceSession<MyPayload>());

// session.loadModel('whisper-base.en')  -> Stream of download progress
// session.start / session.stop  -> one run
// session.inject(payload)       -> timed on the audio clock
// session.transcript            -> SubscriptionRef<Transcript<MyPayload>>
```

- `loadModel` streams byte progress until the worker reports ready. Model
  ids come from `speechModels` in `src/engine/models`.
- `start` opens the microphone; each second a pass re-transcribes the unfrozen
  stretch of audio and freezes words older than the lag.
- `inject` records the press time; placement is recomputed on every pass.
- `stop` runs a last pass, freezes everything and releases the microphone.
- Dials (window, cadence, lag, silence gate) are the optional config argument.

### Deploy

Deploys only run in GitHub Actions. `alchemy.run.ts` throws when the stage is
`prod` or `pr<N>` and `CI` is not `true`.

`.github/workflows/deploy-stt.yml` deploys `prod` to
`stt.kishore.app` on every push to `main`, and `pr<N>` to
`pr<N>-stt.kishore.app` for each pull request that touches the app. PR
stages are removed by `cleanup-stt.yml` when the PR closes.
