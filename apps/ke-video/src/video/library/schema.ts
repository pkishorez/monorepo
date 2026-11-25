/**
 * The shapes ke-video writes to disk and prints with --json, as
 * docs/design.md fixes them: a Video's record, its Events, and the
 * transcript, cuts and summary a finished Video carries.
 */
import { Schema } from 'effect';

export const STEPS = [
  'info',
  'download',
  'audio',
  'transcribe',
  'clean-up',
  'render',
  'transcripts',
  'summary',
] as const;

export const Step = Schema.Literals(STEPS);
export type Step = typeof Step.Type;

export const State = Schema.Literals([
  'queued',
  'running',
  'stopped',
  'failed',
  'done',
]);
export type State = typeof State.Type;

export const Strength = Schema.Literals(['light', 'normal', 'heavy']);
export type Strength = typeof Strength.Type;

export const Removed = Schema.Struct({
  silence: Schema.Finite,
  fillers: Schema.Finite,
  ads: Schema.Finite,
  fillerTalk: Schema.Finite,
});
export type Removed = typeof Removed.Type;

export const Result = Schema.Struct({
  duration: Schema.Finite,
  removed: Removed,
  cuts: Schema.Finite,
});
export type Result = typeof Result.Type;

export const Files = Schema.Struct({
  folder: Schema.String,
  video: Schema.String,
  transcript: Schema.String,
  transcriptFull: Schema.String,
  transcriptJson: Schema.String,
  summary: Schema.String,
  summaryJson: Schema.String,
  cuts: Schema.String,
  original: Schema.String,
});
export type Files = typeof Files.Type;

export const Video = Schema.Struct({
  id: Schema.String,
  url: Schema.String,
  title: Schema.NullOr(Schema.String),
  channel: Schema.NullOr(Schema.String),
  duration: Schema.NullOr(Schema.Finite),
  strength: Strength,
  state: State,
  step: Schema.NullOr(Step),
  progress: Schema.NullOr(Schema.Finite),
  latest: Schema.NullOr(Schema.String),
  done: Schema.Array(Step),
  error: Schema.NullOr(Schema.Struct({ step: Step, message: Schema.String })),
  result: Schema.NullOr(Result),
  files: Files,
  createdAt: Schema.String,
  updatedAt: Schema.String,
});
export type Video = typeof Video.Type;

export const EventStep = Schema.Union([
  Step,
  Schema.Literals(['create', 'check', 'stop', 'done', 'fail']),
]);
export type EventStep = typeof EventStep.Type;

export const Event = Schema.Struct({
  at: Schema.String,
  step: EventStep,
  label: Schema.optionalKey(Schema.String),
  text: Schema.optionalKey(Schema.String),
  progress: Schema.optionalKey(Schema.Finite),
});
export type Event = typeof Event.Type;

export const Line = Schema.Struct({
  start: Schema.Finite,
  end: Schema.Finite,
  text: Schema.String,
});
export type Line = typeof Line.Type;

export const Transcript = Schema.Struct({
  full: Schema.Array(Line),
  trimmed: Schema.Array(Line),
});
export type Transcript = typeof Transcript.Type;

export const CutKind = Schema.Literals([
  'silence',
  'fillers',
  'ad',
  'ask',
  'filler-talk',
]);
export type CutKind = typeof CutKind.Type;

export const Range = Schema.Struct({
  start: Schema.Finite,
  end: Schema.Finite,
});
export type Range = typeof Range.Type;

export const Cuts = Schema.Struct({
  kept: Schema.Array(Range),
  removed: Schema.Array(
    Schema.Struct({
      start: Schema.Finite,
      end: Schema.Finite,
      kind: CutKind,
      reason: Schema.optionalKey(Schema.String),
      text: Schema.optionalKey(Schema.String),
    }),
  ),
});
export type Cuts = typeof Cuts.Type;

const Moment = { at: Schema.Finite, atOriginal: Schema.Finite };

export const Summary = Schema.Struct({
  overview: Schema.String,
  points: Schema.Array(Schema.Struct({ text: Schema.String, ...Moment })),
  chapters: Schema.Array(Schema.Struct({ title: Schema.String, ...Moment })),
});
export type Summary = typeof Summary.Type;
