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
 * - Download  the one running, in `downloading`, as serve.ts moves it to
 *             the end.
 * - Hearing   what every Take turns into.
 */

const Model = Schema.Struct({
  /** Speech to Text was switched on: its wish is kept. */
  wished: Schema.Boolean,
  /** The model's files are on disk. */
  installed: Schema.Boolean,
  /** The download running, in bytes; null when none runs. */
  downloading: Schema.NullOr(
    Schema.Struct({ done: Schema.Int, total: Schema.Int }),
  ),
  /** What a Take turns into; blank for a plain sentence. */
  hearing: Schema.String,
  /** How many times the model was asked to hear. */
  heard: Schema.Int,
});
export type SpeechModel = typeof Model.Type;

const Message = Schema.TaggedUnion({
  // Controls.
  /** Every Take turns into this text (blank: a plain sentence). */
  Hear: { text: Schema.String },

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
export const SPEECH_CONTROLS = ['Hear'] as const satisfies ReadonlyArray<
  SpeechMessage['_tag']
>;

/** Blank: switched off, nothing on disk, a plain sentence heard. */
export const blank = (): SpeechModel => ({
  wished: false,
  installed: false,
  downloading: null,
  hearing: '',
  heard: 0,
});

export const SpeechFake = Actor.define('Speech', {
  model: Model,
  message: Message,
}).build({
  init: () => ({ model: blank() }),
  on: {
    Hear: ({ text }) => ({ model: { hearing: text.trim() } }),

    Wished: () => ({ model: { wished: true } }),
    DownloadStarted: ({ total }) => ({
      model: { downloading: { done: 0, total } },
    }),
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
