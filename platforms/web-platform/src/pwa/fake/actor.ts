import { Schema } from 'effect';
import { Actor } from '@kestack/kabuki';
// Named in the declarations of the Actor this file exports.
import type {} from '@kestack/kabuki/types';

/*
 * The New build fake: the builds of an app that a deploy puts out, as one
 * page sees them through its PWA, in a Kabuki Actor that Requires nothing
 * and starts blank: this page is the newest build. serve.ts answers an
 * app asking to move to its newest build, as `updateToNewest` does.
 *
 * - Out     a Control puts a newer build out, or takes it back.
 * - Move    the app asks once per page load (`MoveAsked`); it waits for a
 *           newer build, then moves (`Moved`): the page is the newest
 *           build from then on, and reloads into it, unless told only to
 *           say so.
 */

const Model = Schema.Struct({
  /** A build newer than the page's is out. */
  newer: Schema.Boolean,
  /** The app asked to move to its newest build and waits for one. */
  waiting: Schema.Boolean,
  /** Moving reloads the page; else it is only said. */
  reloads: Schema.Boolean,
  /** How many times the app asked to move. */
  asked: Schema.Int,
  /** How many times it moved. */
  moved: Schema.Int,
});
export type NewBuildModel = typeof Model.Type;

const Message = Schema.TaggedUnion({
  // Controls
  /** A deploy puts out a build newer than the page's. */
  PutOutNewerBuild: {},
  /** No build newer than the page's is out. */
  NoNewerBuild: {},
  /** Moving to the newest build reloads the page (true), or only says so (false). */
  ReloadWhenMoving: { reload: Schema.Boolean },

  // Sent by serve.ts, for what the app does.
  MoveAsked: {},
  Moved: {},
});
export type NewBuildMessage = typeof Message.Type;

/** The New build fake's Controls, in the bubble's order. */
export const NEW_BUILD_CONTROLS = [
  'PutOutNewerBuild',
  'NoNewerBuild',
  'ReloadWhenMoving',
] as const satisfies ReadonlyArray<NewBuildMessage['_tag']>;

/** Blank: the page is the newest build, and moving reloads it. */
export const blank = (): NewBuildModel => ({
  newer: false,
  waiting: false,
  reloads: true,
  asked: 0,
  moved: 0,
});

export const NewBuildFake = Actor.define('NewBuild', {
  model: Model,
  message: Message,
}).build({
  init: () => ({ model: blank() }),
  on: {
    PutOutNewerBuild: () => ({ model: { newer: true } }),
    NoNewerBuild: () => ({ model: { newer: false } }),
    ReloadWhenMoving: ({ reload }) => ({ model: { reloads: reload } }),
    MoveAsked: (_, { model }) => ({
      model: { waiting: true, asked: model.asked + 1 },
    }),
    // Moved, the page is the newest build: nothing newer is out.
    Moved: (_, { model }) => ({
      model: { newer: false, waiting: false, moved: model.moved + 1 },
    }),
  },
});
