import type { LucideIcon } from '@kstackz/ui-toolkit/lucide';
import type { ComponentType } from 'react';

/**
 * One situation a Topic shows: a sentence, and a live demo of it. The demo
 * fills a box that is already a Gesture Zone: a card on the Topic's page,
 * or the whole screen.
 */
export interface Scenario {
  readonly slug: string;
  /** One sentence: given this, try that. */
  readonly sentence: string;
  readonly Demo: ComponentType;
  /** The demo's file as shown by "Code", imported with `?raw`. */
  readonly source: string;
  /** The demo's file name, as "Code" titles it. */
  readonly file: string;
  /** It needs the whole screen, such as a Swipe from a screen edge: its card opens it. */
  readonly fullScreen?: boolean;
  /** It needs several fingers, so a mouse can't show it. */
  readonly touchOnly?: boolean;
}

/** One page of the Gestures Showcase: the Scenarios of one idea. */
export interface Topic {
  readonly slug: string;
  readonly title: string;
  readonly icon: LucideIcon;
  readonly scenarios: ReadonlyArray<Scenario>;
  /** The Topic's Tweaks button, for the header, when it has Tweaks. */
  readonly Tweaks?: ComponentType;
}

/** A labelled group of Topics in the sidebar. */
export interface TopicGroup {
  readonly label: string;
  readonly topics: ReadonlyArray<Topic>;
}
