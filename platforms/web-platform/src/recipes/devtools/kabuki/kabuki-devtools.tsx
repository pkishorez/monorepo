import { useState } from 'react';
import type { AppRuntime } from '@kestack/kabuki/react';
import { cn } from '#kit/class-names';
import { Live, Presenting } from './live/live.tsx';
import { StoryView } from './story/story-view.tsx';
import type { Story } from './story/story.ts';

/*
 * The Kabuki Devtools on a running app, from its runtime
 * (`App.useRuntime()`): every Actor a card on a canvas to pan and zoom,
 * over a timeline of every Step. It fills whatever holds it and lays itself
 * out by its own width, not the screen's, so it reads the same full screen,
 * in a side panel or on a phone.
 *
 * 1. Live      the app at any Step (./live). With Travel the app on, the
 *              default, a Step picked Time Travels the app itself; the
 *              reader turns it off to look back while the app runs on.
 * 2. Story     given one, a Story told on the app (./story), switched to
 *              from the corner.
 * 3. Present   only the canvas, the whole tree in view, for a talk.
 *
 * Full screen over the app, as an overlay, it is frosted glass: the app
 * shows through, blurred enough that the cards read over it, from the
 * moment it opens.
 */

type Mode = 'live' | 'story';

/** How far, in pixels, an overlay blurs the app behind it. */
const BLUR = 10;

export function KabukiDevtools({
  runtime,
  story,
  defaultTravel = true,
  presenting = false,
  dotted = true,
  timelineAt = 'bottom',
  overlay = false,
  className,
}: {
  /** The running app: `App.useRuntime()`. */
  readonly runtime: AppRuntime;
  /** A Story to tell on the app, beside Live. */
  readonly story?: Story;
  /** Whether a Step picked Time Travels the app at first; the reader switches it. */
  readonly defaultTravel?: boolean;
  /** Only the canvas, the whole tree kept in view as the app changes: no timeline and no controls. */
  readonly presenting?: boolean;
  /** Dots under the cards. On by default; off, a background given by `className` shows through. */
  readonly dotted?: boolean;
  /** Where the timeline sits: under the canvas, or over it, right under the app it travels. */
  readonly timelineAt?: 'top' | 'bottom';
  /** Over the app it inspects, full screen: frosted glass that blurs the app behind, and no dots. */
  readonly overlay?: boolean;
  /** Classes for its root, merged over its own. */
  readonly className?: string;
}) {
  const [mode, setMode] = useState<Mode>('live');
  const [travel, setTravel] = useState(defaultTravel);
  const told = mode === 'story' && story !== undefined;
  return (
    <div
      className={cn(
        '@container relative flex h-full min-h-0 flex-col overflow-hidden bg-background text-foreground',
        overlay && 'bg-background/60',
        className,
      )}
      style={
        overlay
          ? { backdropFilter: `blur(${BLUR}px) saturate(1.5)` }
          : undefined
      }
    >
      {presenting ? (
        <Presenting runtime={runtime} dotted={dotted && !overlay} />
      ) : told ? (
        <StoryView
          runtime={runtime}
          story={story}
          dotted={dotted && !overlay}
          timelineAt={timelineAt}
        />
      ) : (
        <Live
          runtime={runtime}
          travel={travel}
          onTravel={setTravel}
          dotted={dotted && !overlay}
          timelineAt={timelineAt}
        />
      )}
      {story && !presenting && (
        <div
          role="radiogroup"
          aria-label="Mode"
          // Clear of a timeline at the top.
          className={cn(
            'absolute left-3 z-30 flex rounded-lg border border-border bg-background/90 p-0.5 shadow-sm backdrop-blur',
            timelineAt === 'top' ? 'bottom-3' : 'top-3',
          )}
        >
          {(
            [
              ['live', 'Live'],
              ['story', 'Story'],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={mode === value}
              onClick={() => setMode(value)}
              className={cn(
                'h-7 rounded-md px-3 text-xs outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none touch:h-10',
                mode === value
                  ? 'bg-muted font-medium text-foreground'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
