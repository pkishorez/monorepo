import type { History } from '@kestack/kabuki';

/*
 * A Story: what an agent tells to answer a question about an app, played
 * on the app as it ran. It is only data: each Scene names a moment of the
 * History, the card it is about and the one part of it to light, and says
 * one thing. An agent never draws anything.
 *
 * Only the data, for now: the Inspector reads the app through the Kabuki
 * Session Api alone, which tells no Story yet, so it plays none.
 *
 * It plays on one of two Histories:
 *
 * 1. Live     none given: the app's own, as it ran in this tab, for a
 *             question about the app in use. Each run differs, and a
 *             moment can fall out of its Window.
 * 2. Script   a saved History the Story carries, played the same every
 *             time, for docs and walkthroughs. Replayed, it runs no
 *             Workers and no Commands.
 *
 * A card is named by its path of Child names from the root, `''` for the
 * root itself and `page/dictation` below it, whatever its keys and IDs:
 * the same Story reads the same in any run.
 */

/** The part of a card a Scene lights; none for the whole card. */
export type Part =
  | { readonly kind: 'state'; readonly name: string }
  | { readonly kind: 'worker'; readonly name: string }
  | { readonly kind: 'message'; readonly name: string; readonly state?: string }
  | { readonly kind: 'child'; readonly name: string }
  | { readonly kind: 'model' }
  | { readonly kind: 'props' }
  /** Its Requires, or the one Capability named in them. */
  | { readonly kind: 'requires'; readonly name?: string }
  /** What it Provides, or the one Capability named in it. */
  | { readonly kind: 'provides'; readonly name?: string };

/**
 * A moment of the History: right after the first Message with this tag
 * for the card at `to`, or right before it; with `changed`, the first one
 * that changed that card. None is the app at its last Step.
 */
export interface Moment {
  readonly message: string;
  readonly to?: string;
  readonly before?: true;
  readonly changed?: true;
}

export interface Scene {
  readonly at?: Moment;
  /** The card the Scene is about: opened, brought into view, its part lit. */
  readonly card: string;
  readonly part?: Part;
  /** Other cards lit beside it, as a parent it came from. */
  readonly with?: ReadonlyArray<string>;
  readonly title: string;
  readonly say: string;
}

export interface Story {
  /** What it answers, as the reader asked it. */
  readonly question: string;
  readonly scenes: ReadonlyArray<Scene>;
  /** The History it plays on, saved; none for the app's own. */
  readonly script?: History.Saved;
}
