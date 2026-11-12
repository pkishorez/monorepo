import { Schema } from 'effect';
import { expectTypeOf } from 'vitest';
import { Actor } from '../../core/index.ts';
import type { Runtime, Step } from '../../core/index.ts';
import type { AppRuntime, Attachment } from '../view/index.ts';

/*
 * An app typed by its root's Actor is an app of any Actor: a tool written
 * for every app, an Attachment of no Actor in particular, takes it.
 */

const Counter = Actor.define('Counter', {
  model: { count: Schema.Number },
  message: { Bumped: {} },
}).build({
  init: () => ({ model: { count: 0 } }),
  on: { Bumped: (_, { model }) => ({ model: { count: model.count + 1 } }) },
});

declare const app: AppRuntime<typeof Counter>;

expectTypeOf(app).toExtend<AppRuntime>();
const any: AppRuntime = app;
const tool: Attachment = (seen) => {
  void seen.runtime?.snapshot.root.model;
  return () => {};
};
tool(app);
void any;

// Typed, its Runtime and the Step it Seeks are its own Actor's.
expectTypeOf(app.runtime).toEqualTypeOf<Runtime<typeof Counter> | null>();
expectTypeOf(app.seeking).toEqualTypeOf<Step<typeof Counter> | null>();
expectTypeOf(app.seek).parameter(0).toEqualTypeOf<number | null>();
expectTypeOf(app.toHead).toEqualTypeOf<() => void>();
