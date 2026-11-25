# ke-video

Turns a YouTube link into a short video with silences, fillers, ads and filler talk removed, its transcript and a summary, through the ke-video command and a local web app.

## Big picture

A long video is mostly worth watching in parts: pauses, ums, sponsor reads, greetings and small talk sit between the parts that matter. ke-video downloads the video, hears every word with its time on this computer, asks Claude which sentences are ads or filler, and renders a new video from only the words worth keeping. Next to it, it writes the full and the trimmed transcript and a summary whose points and chapters link to times in both videos.

The command is the only interface. `create` starts one detached worker per video and returns at once; `list`, `status` and `logs` read what the workers write, from any terminal, at any time, and `stop`, `resume` and `delete` control them. The web app runs those same commands on its server and reads the files they name, so the two always agree. One video is processed at a time; the rest wait their turn.

What gets cut is decided by [skill/cut-rules.md](skill/cut-rules.md), and the summary by [skill/summary-rules.md](skill/summary-rules.md). Claude reads both, with [skill/learnings.md](skill/learnings.md), on every run, and adds a line to the learnings when it finds something that would change a later cut or summary. The commands, files, steps and their reasons are in [docs/design.md](docs/design.md). It builds on [ai-toolkit](../../toolkits/ai-toolkit/README.md) for Claude and Speech to Text, and [cli-platform](../../platforms/cli-platform/README.md) for its folders and one worker per video.

## Usage

### Make a short video from the command line

Install what it runs first: `brew install yt-dlp ffmpeg`, and Claude Code signed in (`npm install -g @anthropic-ai/claude-code`, then `claude`). `create` says what is missing and how to install it. The speech model (about 660 MB) downloads itself on the first run. From the repo root:

```sh
pnpm ke-video create https://youtu.be/xAt1xcC6qfM   # starts its worker and returns
pnpm ke-video create <link> --strength heavy        # light, normal (default) or heavy
pnpm ke-video list                                  # every video, with the step and % of those working
pnpm ke-video status xAt1xcC6qfM                    # steps done, the one running, the latest line
pnpm ke-video logs xAt1xcC6qfM -f                   # every line so far, then new ones as they come
pnpm ke-video stop xAt1xcC6qfM                      # stops it; finished steps are kept
pnpm ke-video resume xAt1xcC6qfM                    # carries on from the first step not done
pnpm ke-video clip xAt1xcC6qfM 3                    # a short clip of removed part 3, with 2 s before it; prints its path
pnpm ke-video delete xAt1xcC6qfM                    # stops it and removes all its files
```

- Every command takes `--json`; `logs --json` prints one Event per line. The id is the YouTube video id.
- The steps are info, download, audio, transcribe, clean-up, render, transcripts and summary. Each writes its files whole before it counts as done, so `resume` after a stop, a failure or a reboot redoes at most one step (transcribe resumes piece by piece).
- A finished video's folder holds `video.mp4`, `transcript.md`, `transcript-full.md`, `transcript.json`, `summary.md`, `summary.json` and `cuts.json` (every removed part, its kind and why; each of Claude's cuts on its own). `status` prints their paths.
- `clip <id> <n>` makes a small H.264 clip of removed part `n` (its place in `cuts.json`, from 0), from 2 s before it to 1.5 s after it, and keeps it for next time. A cut over 30 s shows its first 20 s and last 5 s.
- Files live under `$KE_VIDEO_HOME`, or `ke-video` in kestack's shared data folder (`~/.local/share/kestack/ke-video` by default).

### Watch and read in the browser, on a laptop or a phone

```sh
pnpm --filter ke-video web       # this computer only; prints the address
pnpm --filter ke-video web:lan   # also reachable from a phone on the same Wi-Fi
```

- The list refreshes every two seconds and has a box to paste a link. A video still working shows its steps and its log as it is written; a finished one shows the player, chapters, the summary, the transcript following playback (tap a line to jump there) and the cuts. Playing a cut plays its clip, with a bar that marks what was removed.
- On a phone the player stays at the top while the transcript and summary scroll under it.
- `web:lan` has no sign-in: anyone on the network can add and delete videos. Use it only on a network you trust.

### Run the tests

```sh
pnpm --filter ke-video test                                    # unit tests and the CLI end to end, with a fake pipeline
cd apps/ke-video && KE_VIDEO_E2E=1 pnpm exec vitest run --config src/video/pipeline/tests/e2e.config.ts   # the real pipeline on a real video
```

- The first runs the real CLI and workers in a temporary library with the pipeline swapped for a fake one, through stop, resume and delete.
- The second downloads a short video, transcribes it, asks Claude and renders it; it checks the known sponsor read is cut.
