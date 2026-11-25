# ke-video design

The one source of truth while ke-video is built. Every part (CLI, worker,
web app, ai-toolkit additions) builds against what this file fixes. Change
it here first if a part needs something different.

## What it is

`ke-video create <youtube link>` turns a YouTube video into three things:
a short video with silences, fillers, ads and filler talk removed; a
transcript (full and trimmed); and a summary. The CLI is the only interface:
the web app calls the CLI and reads the files the CLI names.

Machine requirements, checked by `create` and `resume`, each failure printed
with its install line: `yt-dlp` (`brew install yt-dlp`), `ffmpeg` and
`ffprobe` (`brew install ffmpeg`), `claude` (install Claude Code and sign in:
`npm install -g @anthropic-ai/claude-code`, then `claude`). The Parakeet
speech model downloads itself on first use. Claude is the only Language
Model; all judgment (ads, filler talk, summary) is Claude's.

## Package layout

One private app, `apps/ke-video`. TypeScript runs directly on Node 24 (type
stripping): every relative import ends in `.ts`/`.tsx`, type-only imports use
`import type`, no enums, no parameter properties. Workspace packages resolve
to their built `dist`, so they are built first.

```
apps/ke-video/
  bin/ke-video.mjs     #!/usr/bin/env node, imports ../src/cli/main.ts
  skill/               cut-rules.md, summary-rules.md, learnings.md (read every run)
  docs/design.md       this file
  src/
    cli/               the commands: parse args, print text or JSON
    video/             the library on disk, the worker and its pipeline
    web/               the Kabuki Start web app (local only, `vp dev`)
```

Root `package.json` gets `"ke-video": "node apps/ke-video/bin/ke-video.mjs"`,
so `pnpm ke-video list` works from the repo root.

## Where files live

Library root: `$KE_VIDEO_HOME` if set (tests set it), else
`<shared>/ke-video` where `<shared>` is cli-platform's shared data folder
(`folders(...).shared`, `~/.local/share/kestack` by XDG). Speech model:
`<library root>/model`. One folder per video: `<root>/videos/<id>/`, `<id>`
being the YouTube video id exactly as YouTube writes it.

```
videos/<id>/
  video.json            the Video record below; rewritten atomically (tmp + rename)
  log.jsonl             append-only Events, one JSON object per line
  video.mp4             the short video                         (render)
  transcript.json       { full: Line[], trimmed: Line[] }       (transcripts)
  transcript.md         trimmed transcript, times of video.mp4  (transcripts)
  transcript-full.md    full transcript, original times         (transcripts)
  summary.json          Summary below                           (summary)
  summary.md            the same as Markdown                    (summary)
  cuts.json             Cuts below                              (clean-up)
  work/                 info.json, original.mp4, audio.pcm, silences.json,
                        pieces/NNNNN.json, words.json, sentences.json, plan.json
```

## The Video record (`video.json`, and `status --json`)

```ts
type Step =
  | 'info'
  | 'download'
  | 'audio'
  | 'transcribe'
  | 'clean-up'
  | 'render'
  | 'transcripts'
  | 'summary';
type State = 'queued' | 'running' | 'stopped' | 'failed' | 'done';

interface Video {
  id: string;
  url: string; // as given to create
  title: string | null; // null until info
  channel: string | null;
  duration: number | null; // seconds of the original
  strength: 'light' | 'normal' | 'heavy';
  state: State;
  step: Step | null; // the step running, or where it stopped/failed
  progress: number | null; // 0..1 within step, null if not measurable
  latest: string | null; // text of the last Event with text
  done: Step[]; // finished steps, in order
  error: { step: Step; message: string } | null;
  result: {
    duration: number; // seconds of video.mp4
    removed: {
      silence: number;
      fillers: number;
      ads: number;
      fillerTalk: number;
    }; // seconds
    cuts: number; // count of removed ranges
  } | null;
  files: {
    // absolute paths; a file exists once its step is done
    folder: string;
    video: string;
    transcript: string;
    transcriptFull: string;
    transcriptJson: string;
    summary: string;
    summaryJson: string;
    cuts: string;
    original: string; // work/original.mp4, for playing removed parts
  };
  createdAt: string; // ISO
  updatedAt: string;
}
```

`state` on disk can be stale if a worker died without writing it (kill -9,
reboot). `list` and `status` reconcile: a Video whose record says `queued` or
`running` but has no live worker is reported as `stopped`. (They do not
rewrite the file.)

## Events (`log.jsonl`, and `logs --json`)

```ts
interface Event {
  at: string; // ISO
  step: Step | 'create' | 'check' | 'stop' | 'done' | 'fail';
  label?: string; // what to print in the step column if not `step`,
  // e.g. 'silence', 'fillers', 'ads', 'filler talk', 'plan'
  text?: string; // a line for humans
  progress?: number; // 0..1 within step; written at most once per whole percent
}
```

Text form (what `logs` prints): `HH:MM:SS  <label or step, padded to 12>  <text or NN%>`.
In a TTY, consecutive progress-only Events of one step rewrite one line in
place; piped, only multiples of 5% and 100% print.

## Commands

All read commands take `--json`. Exit code 1 with one plain line on stderr
on any error. Ids are the YouTube video id; `create` parses it from the link
(watch?v=, youtu.be/, shorts/, live/, embed/) without a network call.

| Command                                           | Does                                                                                                                                     | `--json` prints             |
| ------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | --------------------------- |
| `create <link> [--strength light\|normal\|heavy]` | checks requirements, makes the folder and record (`queued`), starts the worker, returns                                                  | the Video                   |
| `list`                                            | every Video, newest first                                                                                                                | `Video[]`                   |
| `status <id>`                                     | one Video: steps done, the running step and %, the latest line                                                                           | the Video                   |
| `logs <id> [-f]`                                  | every Event so far; `-f` keeps streaming until the Video is no longer queued or running                                                  | one Event per line (NDJSON) |
| `stop <id>`                                       | stops its worker; finished steps stay                                                                                                    | the Video                   |
| `resume <id>`                                     | starts a worker again from the first step not done. Refused while one runs: "<id> is already running. Stop it first: ke-video stop <id>" | the Video                   |
| `delete <id>`                                     | stops its worker if running, then removes its folder                                                                                     | `{ id, freed }` (bytes)     |

`create` on an existing id is refused: "<id> already exists: resume it with
ke-video resume <id>, or remove it with ke-video delete <id>". Default
strength is `normal`; `resume` keeps the Video's strength.

## The worker

`create` and `resume` spawn `node src/video/worker/main.ts <id>` (path
resolved from the package) detached, with stdio to `work/worker.log`, and
`unref` it. One worker per video and one busy at a time, both through
cli-platform's `single` (a Unix socket per name, freed by the kernel however
the process ends):

- the worker claims `single(<runtime>/…/worker-<hash of id>)` serving a
  small RPC group `{ stop }`; `AlreadyRunning` means exit at once. `reach`
  answering means "a worker is live" for `list`/`status`/`resume`/`delete`.
- before its first step it claims the busy name `single(<runtime>/…/busy)`,
  retrying every 2 s while another worker holds it; meanwhile the Video is
  `queued` and one Event says which video it waits for, if it can tell.
- `stop` calls the worker's `stop`, which interrupts the pipeline fiber:
  child processes (yt-dlp, ffmpeg) are killed by their finalizers, the record
  becomes `stopped` with an Event "stopped during <step> (NN%)", and the
  process exits. SIGTERM does the same.
- Any step failure: record `failed` with `error`, a `fail` Event with the
  message, exit 1. `resume` picks up at the failed step.

Each step writes its outputs then marks itself done in the record. A step's
partial outputs are written as `.part` and renamed, so a done step's files
are always whole. `transcribe` resumes piece by piece (a piece file that
exists is not heard again).

## The pipeline

1. **info**: `yt-dlp -J --no-playlist <url>` → `work/info.json`; sets
   title, channel, duration. Keeps chapters and description for Claude.
2. **download**: `yt-dlp` best mp4 video ≤1080p + m4a audio merged to
   `work/original.mp4`, `--newline` progress parsed into Events.
3. **audio**: `ffmpeg` → `work/audio.pcm`, 16 kHz mono s16le; then
   `silencedetect` (‑35 dB, 0.25 s) → `work/silences.json`.
4. **transcribe**: cut the audio into pieces of at most 20 s, each cut in
   the middle of the nearest silence (else the quietest 200 ms). Each piece
   goes to ai-toolkit's Recognizer `hear`, giving words with start and end;
   offsets added → `work/pieces/NNNNN.json`, one Event per piece with
   `[HH:MM:SS] <text>`, progress = seconds heard / duration. Then all words →
   `work/words.json`.
5. **clean-up**:
   - sentences from words (end at . ? !, or a gap over 1.5 s, or 40 words)
     → `work/sentences.json`, numbered from 1.
   - one Claude One-shot Prompt: `skill/cut-rules.md`, `skill/learnings.md`,
     the strength, title, channel, description, chapters, and the numbered
     sentences with their start times. It answers JSON only:
     `{ cuts: [{ from: n, to: n, kind: 'ad' | 'ask' | 'filler-talk', reason }], learnings: string[] }`.
     Decoded with Schema; ids must exist, from ≤ to, ranges are merged. One
     retry with the decode error appended; a second failure logs a warning
     and goes on with no Claude cuts. Transcripts over ~2,500 sentences go in
     chunks with 20 sentences of overlap.
   - the plan: keep every word not in a cut sentence and not a filler word
     (um, uh, umm, uhm, er, erm, ah, hmm, mm), each widened by 0.12 s.
     Between two kept words: a silent gap (inside `silences.json`) up to the
     strength's pause limit (0.8 / 0.5 / 0.3 s) is kept whole; a longer
     silent gap is cut to 0.12 s each side (`silence`); a gap with sound but
     no words over 0.3 s is cut likewise (`fillers`). Pieces under 0.3 s
     join their neighbour or go. Every boundary snaps to the video's frame
     grid so sound and picture cut together.
   - → `cuts.json` and `work/plan.json`; Events: silence total, fillers
     total, each Claude cut (`cut HH:MM:SS–HH:MM:SS  <reason>`) under
     `ads` or `filler talk`, then `plan` with `old → new (NN% shorter), N cuts`.
6. **render**: `ffmpeg` keeps the planned ranges (select/aselect, in
   batches if many, joined with the concat demuxer), H.264 (`h264_videotoolbox`
   when listed by `ffmpeg -encoders`, else libx264) + AAC → `video.mp4`.
   Progress from `-progress`. Then `ffprobe` checks the length equals the
   plan within 1 s, else the step fails.
7. **transcripts**: map every kept word to its time in `video.mp4` →
   `transcript.json`, `transcript.md`, `transcript-full.md`.
8. **summary**: one Claude One-shot Prompt with `skill/summary-rules.md`,
   `skill/learnings.md` and the trimmed sentences numbered, answering JSON
   `{ overview, points: [{ text, sentence }], chapters: [{ title, sentence }], learnings }`;
   sentence numbers become times in both videos → `summary.json`,
   `summary.md`. Same retry rule.

Learnings: any `learnings` Claude returns are appended to
`skill/learnings.md` as `- <text> (<id>, <date>)`, skipping exact repeats,
each with an Event `learned: <text>`. The prompts tell Claude to add one only
when it is new, general (not about this one video) and would change a
future cut or summary; usually none.

```ts
interface Line {
  start: number;
  end: number;
  text: string;
} // seconds
interface Cuts {
  kept: { start: number; end: number }[]; // original seconds
  removed: {
    start: number;
    end: number;
    kind: 'silence' | 'fillers' | 'ad' | 'ask' | 'filler-talk';
    reason?: string;
    text?: string;
  }[];
}
interface Summary {
  overview: string;
  points: { text: string; at: number; atOriginal: number }[];
  chapters: { title: string; at: number; atOriginal: number }[];
}
```

## ai-toolkit additions

- `claudeOneShot`: Layer of `OneShotPrompt` answered by Claude Code (no
  tools, one turn, nothing kept, temp folder), and `claudeOneShotWith({
  model?, timeout? })` for a caller that needs another Language Model or a
  longer wait. ke-video uses `claudeOneShotWith({ timeout: '15 minutes' })`
  and the account's default model.
- `Recognizer.hear(samples)`: like `transcribe`, but answers
  `{ text, words: { text, start, end }[] }` with seconds from the start of
  the buffer, grouped from Parakeet's tokens, timestamps and durations.
  `transcribe` is unchanged.

## Web app

Local only: `pnpm --filter ke-video web` runs `vp dev`. It never touches
files or processes except through two server-side doors: running the CLI
(`node bin/ke-video.mjs … --json`) and reading files at the paths a Video's
`files` names. A small Vite plugin adds `/api/*` routes:

- `GET /api/videos` → `list --json`; the list page refetches every 2 s.
- `GET /api/videos/:id` → `status --json`; the detail page refetches every 2 s
  while queued or running.
- `GET /api/videos/:id/logs` → `logs <id> -f --json`, streamed as NDJSON.
- `GET /api/videos/:id/file/:name` (`video`, `original`, `transcriptJson`,
  `summaryJson`, `cuts`) → the file, with HTTP Range for mp4.
- `POST /api/videos` `{ url, strength }`, `POST /api/videos/:id/stop`,
  `POST /api/videos/:id/resume`, `DELETE /api/videos/:id` → the commands.

Pages: the list (title, length old → new, status with step and %, a create
box), and a video page: while working, its status and the streamed log in
the CLI's text form; when done, the player with chapters, the summary with
times that seek, the trimmed transcript following playback (click a line to
seek), and the cuts (each with kind, reason and original time; plays that
part of the original).
