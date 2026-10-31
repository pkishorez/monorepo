import { useMemo } from 'react';
import type { CSSProperties } from 'react';
import { Layer } from 'effect';
import { View } from '@kestack/kabuki/react';
import type { AppRuntime } from '@kestack/kabuki/react/view';
import { cn } from '@kestack/web-platform/ui/components/utils';
import { inMemory } from '../session/index.ts';
import { InspectorView } from './actor-inspector/index.ts';
import { KabukiSession } from './kabuki-session/index.ts';

/*
 * The Inspector, Kabuki Actors that read and move one Kabuki Session only
 * through the Kabuki Session Api, and requires it as one Capability,
 * `KabukiSession` (./kabuki-session). Its words are the Kabuki context's:
 * the Inspector, the Timeline, the Step.
 *
 * 1. Place   the Inspector Actor and its View (./actor-inspector), as a
 *            Child of another app, which Provides its Kabuki Session: as
 *            DevTools' `/kabuki` page does, with a remote one.
 * 2. Dock    `KabukiInspector`: the Inspector as its own app, beside a
 *            running app in the same page, its Kabuki Session answered in
 *            memory by that app. It fills whatever holds it and lays itself
 *            out by its own width, not the screen's, so it reads the same
 *            full screen, in a side panel or on a phone. Full screen over
 *            the app, as an overlay, it is frosted glass: the app shows
 *            through, blurred enough that the cards read over it.
 *
 * Its classes come with it: an app's Tailwind generates them from
 * `@kestack/devtools-kabuki/inspector/sources.css`.
 */

/** How far, in pixels, an overlay blurs the app behind it. */
const BLUR = 10;

/** One Inspector app per running app inspected, kept across its mounts. */
const apps = new WeakMap<AppRuntime, ReturnType<typeof inspectorOf>>();

const inspectorOf = (
  runtime: AppRuntime,
  input: {
    readonly travel: boolean;
    readonly look: {
      readonly presenting: boolean;
      readonly place: 'top' | 'bottom';
    };
  },
) =>
  View.app(InspectorView, {
    layer: Layer.effect(KabukiSession)(inMemory(runtime)),
    // Its own, never the app's: two apps of one name cannot share a History.
    name: `@kestack/devtools-kabuki/inspector:${runtime.name}`,
    // Only as it is now: nothing of the Inspector's own is travelled.
    window: 0,
    input: () => input,
  });

export function KabukiInspector({
  runtime,
  defaultTravel = true,
  presenting = false,
  dotted = true,
  timelineAt = 'bottom',
  overlay = false,
  className,
}: {
  /** The running app: `App.useRuntime()`. */
  readonly runtime: AppRuntime;
  /** Whether a Step picked Time Travels the app at first; the reader switches it. */
  readonly defaultTravel?: boolean;
  /** Only the canvas, the whole tree kept in view as the app changes: no Timeline and no controls. */
  readonly presenting?: boolean;
  /** Dots under the cards. On by default; off, a background given by `className` shows through. */
  readonly dotted?: boolean;
  /** Where the Timeline sits: under the canvas, or over it, right under the app it travels. */
  readonly timelineAt?: 'top' | 'bottom';
  /** Over the app it inspects, full screen: frosted glass that blurs the app behind, and no dots. */
  readonly overlay?: boolean;
  /** Classes for its root, merged over its own. */
  readonly className?: string;
}) {
  // Read once, at the first mount for this app, as an Input is.
  const App = useMemo(() => {
    const kept = apps.get(runtime);
    if (kept) return kept;
    const made = inspectorOf(runtime, {
      travel: defaultTravel,
      look: { presenting, place: timelineAt },
    });
    apps.set(runtime, made);
    return made;
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [runtime]);
  return (
    <div
      className={cn(
        '@container relative flex h-full min-h-0 flex-col overflow-hidden bg-background text-foreground',
        overlay && 'bg-background/60',
        className,
      )}
      style={{
        ...(overlay ? { backdropFilter: `blur(${BLUR}px) saturate(1.5)` } : {}),
        ...(dotted && !overlay
          ? {}
          : ({ '--inspector-dots': 'none' } as CSSProperties)),
      }}
    >
      <App />
    </div>
  );
}

export {
  Inspector,
  InspectorLive,
  InspectorView,
} from './actor-inspector/index.ts';
export { KabukiSession } from './kabuki-session/index.ts';
export type { Moment, Part, Scene, Story } from './story.ts';
