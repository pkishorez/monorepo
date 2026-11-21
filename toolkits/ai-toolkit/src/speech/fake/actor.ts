import { Schema } from 'effect';
import { Actor } from '@kestack/kabuki';
// Named in the declarations of the Actor this file exports.
import type {} from '@kestack/kabuki/types';

/*
 * The Speech fake: what Speech to Text stands on, on a computer (its
 * folder, the model's download, and the model hearing), in a Kabuki Actor
 * that Requires nothing and starts blank: switched off, nothing on disk.
 * serve.ts runs the real speech model and Takes over it (`../front`), so
 * Code sees what a real computer would say.
 *
 * - Disk      whether it was switched on (`wished`) and the model is on
 *             disk (`installed`), as the speech model writes and deletes
 *             them.
 * - Download  one running at a time, in `downloading`: by itself it runs
 *             to the end in a few steps; held, only the Controls move it
 *             (to a percent, finished, or failed). A failure asked for
 *             while none runs fails the next one at once.
 * - Hearing   what every Take turns into, all at once or a few words a
 *             second of audio; or nothing; or failing; or never answering.
 */

const Ending = Schema.TaggedUnion({
  Finished: {},
  Failed: { reason: Schema.String },
});

const Model = Schema.Struct({
  /** Speech to Text was switched on: its wish is kept. */
  wished: Schema.Boolean,
  /** The model's files are on disk. */
  installed: Schema.Boolean,
  /** Downloads wait for the Controls instead of running by themselves. */
  downloadsHeld: Schema.Boolean,
  /** The download running, in bytes, and how a Control ended it; null when none runs. */
  downloading: Schema.NullOr(
    Schema.Struct({
      done: Schema.Int,
      total: Schema.Int,
      ending: Schema.NullOr(Ending),
    }),
  ),
  /** Why the next download fails at once; null when it does not. */
  failNextDownload: Schema.NullOr(Schema.String),
  hearing: Schema.Struct({
    /** What a Take turns into; blank for a plain sentence. */
    text: Schema.String,
    /** Words heard per second of audio; 0 hears the whole text at once. */
    wordsPerSecond: Schema.Finite,
    /** Nothing is heard: every Take turns into no words. */
    nothing: Schema.Boolean,
    /** Why hearing fails; null when it works. */
    fails: Schema.NullOr(Schema.String),
    /** The model answers; false, it never does, and a Take times out. */
    answering: Schema.Boolean,
  }),
  /** How many times the model was asked to hear. */
  heard: Schema.Int,
});
export type SpeechModel = typeof Model.Type;

const Message = Schema.TaggedUnion({
  // Controls: the download.
  /** Downloads wait for the Controls below. */
  HoldDownloads: {},
  /** Downloads run to the end by themselves again. */
  LetDownloadsRun: {},
  /** The running download reaches this share, in percent. */
  DownloadTo: { percent: Schema.Finite },
  /** The running download finishes. */
  FinishDownload: {},
  /** The running download fails, saying this; with none running, the next one does. */
  FailDownload: { reason: Schema.String },

  // Controls: hearing.
  /** Every Take turns into this text (blank: a plain sentence). */
  Hear: { text: Schema.String },
  /** Words are heard a few per second of audio as it comes (0: all at once). */
  HearAsItGoes: { wordsPerSecond: Schema.Finite },
  /** Nothing is heard. */
  HearNothing: {},
  /** Hearing fails, saying this (blank: works again). */
  FailHearing: { reason: Schema.String },
  /** The model stops answering, as when it hangs. */
  StopAnswering: {},
  /** The model answers again. */
  AnswerAgain: {},

  // Sent by serve.ts, for what the speech model does.
  Wished: {},
  DownloadStarted: { total: Schema.Int },
  Progressed: { done: Schema.Int },
  Downloaded: {},
  DownloadLetGo: {},
  Removed: {},
  Heard: {},
});
export type SpeechMessage = typeof Message.Type;

/** The Speech fake's Controls, in the bubble's order. */
export const SPEECH_CONTROLS = [
  'HoldDownloads',
  'LetDownloadsRun',
  'DownloadTo',
  'FinishDownload',
  'FailDownload',
  'Hear',
  'HearAsItGoes',
  'HearNothing',
  'FailHearing',
  'StopAnswering',
  'AnswerAgain',
] as const satisfies ReadonlyArray<SpeechMessage['_tag']>;

/** Blank: switched off, nothing on disk, downloads running by themselves, a plain sentence heard. */
export const blank = (): SpeechModel => ({
  wished: false,
  installed: false,
  downloadsHeld: false,
  downloading: null,
  failNextDownload: null,
  hearing: {
    text: '',
    wordsPerSecond: 0,
    nothing: false,
    fails: null,
    answering: true,
  },
  heard: 0,
});

const given = (text: string) => (text.trim() === '' ? null : text.trim());

export const SpeechFake = Actor.define('Speech', {
  model: Model,
  message: Message,
}).build({
  init: () => ({ model: blank() }),
  on: {
    HoldDownloads: () => ({ model: { downloadsHeld: true } }),
    LetDownloadsRun: () => ({ model: { downloadsHeld: false } }),
    DownloadTo: ({ percent }, { model }) =>
      model.downloading === null || model.downloading.ending !== null
        ? {}
        : {
            model: {
              downloading: {
                ...model.downloading,
                done: Math.round(
                  (model.downloading.total *
                    Math.min(100, Math.max(0, percent))) /
                    100,
                ),
              },
            },
          },
    FinishDownload: (_, { model }) =>
      model.downloading === null
        ? {}
        : {
            model: {
              downloading: {
                ...model.downloading,
                ending: { _tag: 'Finished' as const },
              },
            },
          },
    FailDownload: ({ reason }, { model }) => {
      const why = given(reason) ?? 'The download was cut off.';
      return model.downloading === null || model.downloading.ending !== null
        ? { model: { failNextDownload: why } }
        : {
            model: {
              downloading: {
                ...model.downloading,
                ending: { _tag: 'Failed' as const, reason: why },
              },
            },
          };
    },
    Hear: ({ text }, { model }) => ({
      model: {
        hearing: { ...model.hearing, text: text.trim(), nothing: false },
      },
    }),
    HearAsItGoes: ({ wordsPerSecond }, { model }) => ({
      model: {
        hearing: {
          ...model.hearing,
          wordsPerSecond: Math.max(0, wordsPerSecond),
        },
      },
    }),
    HearNothing: (_, { model }) => ({
      model: { hearing: { ...model.hearing, nothing: true } },
    }),
    FailHearing: ({ reason }, { model }) => ({
      model: { hearing: { ...model.hearing, fails: given(reason) } },
    }),
    StopAnswering: (_, { model }) => ({
      model: { hearing: { ...model.hearing, answering: false } },
    }),
    AnswerAgain: (_, { model }) => ({
      model: { hearing: { ...model.hearing, answering: true } },
    }),

    Wished: () => ({ model: { wished: true } }),
    DownloadStarted: ({ total }, { model }) =>
      model.failNextDownload === null
        ? { model: { downloading: { done: 0, total, ending: null } } }
        : {
            model: {
              failNextDownload: null,
              downloading: {
                done: 0,
                total,
                ending: {
                  _tag: 'Failed' as const,
                  reason: model.failNextDownload,
                },
              },
            },
          },
    Progressed: ({ done }, { model }) =>
      model.downloading === null
        ? {}
        : { model: { downloading: { ...model.downloading, done } } },
    Downloaded: () => ({ model: { installed: true, downloading: null } }),
    DownloadLetGo: () => ({ model: { downloading: null } }),
    Removed: () => ({
      model: { wished: false, installed: false, downloading: null },
    }),
    Heard: (_, { model }) => ({ model: { heard: model.heard + 1 } }),
  },
});
