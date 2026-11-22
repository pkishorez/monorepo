import type { Layer } from 'effect';
import type { Runtime, Snapshot } from '@kestack/kabuki';
import type { AnyActor } from '@kestack/kabuki/types';

/*
 * A Fake: one thing in the outside world a person would name (a computer,
 * a sign-in, a microphone), run in the tab. Structural: a Fake is a plain
 * object of this shape and never imports it, so the package that fakes an
 * edge does not depend on this one. An app types its list with it.
 *
 * - `actor`     a built Kabuki Actor that Requires nothing and starts blank.
 * - `controls`  the Message tags the bubble offers, of the Actor or of any
 *               Actor below it: each Instance offers the ones its Actor has.
 * - `serve`     the running Actor, its Runtime, to the Layer of the edges it
 *               fakes, built in the Fake World's Scope.
 * - `kept`      the Snapshot a reload keeps, when it is not the whole one.
 */

/**
 * One Fake, as the Fake World runs it. `Out` is `never` unless named: a
 * Layer's outputs are contravariant, so `Fake` alone takes any Fake's,
 * one that serves only a Reference (a Layer of `never`) too.
 */
export interface Fake<
  A extends AnyActor = AnyActor,
  Out = never,
  E = any,
  R = any,
> {
  /** What a person calls it: the bubble's heading, and its saved Snapshot's name. */
  readonly name: string;
  readonly actor: A;
  /** The Message tags the bubble offers as Controls. */
  readonly controls: ReadonlyArray<string>;
  /** The Layer of the edges it fakes, over its running Actor. */
  serve(runtime: Runtime<A>): Layer.Layer<Out, E, R>;
  /** The Snapshot a reload keeps; the whole one without it. */
  kept?(snapshot: Snapshot<A>): Snapshot<A>;
}

/** The edges a Fake serves. */
export type EdgesOf<F> = F extends {
  serve(runtime: never): Layer.Layer<infer Out, any, any>;
}
  ? Out
  : never;

/** What building a Fake's edges may fail with. */
export type ErrorOf<F> = F extends {
  serve(runtime: never): Layer.Layer<any, infer E, any>;
}
  ? E
  : never;

/** What a Fake's edges need from outside: nothing, for most. */
export type NeedsOf<F> = F extends {
  serve(runtime: never): Layer.Layer<any, any, infer R>;
}
  ? R
  : never;
