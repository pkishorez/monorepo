import { useCallback, useRef, useState } from 'react';
import { ArrowDownIcon } from 'lucide-react';
import type { Line } from '../../../../../video/library/schema.ts';
import { clock } from '../../../format/index.ts';
import { type Player, usePlaying } from './player.ts';

/*
 * The trimmed transcript, in the short video's times. The line being
 * played is marked, and kept a third of the way down what can be seen:
 * in its own box from a laptop up, on the page itself on a phone, below
 * the pinned player and tabs. A hand scrolling it stops that, until
 * "Back to now" or a tap on a line, which seeks there.
 */

const SCROLL_KEYS = new Set([
  'ArrowUp',
  'ArrowDown',
  'PageUp',
  'PageDown',
  'Home',
  'End',
]);

/** Whether the box scrolls on its own, or the page scrolls it. */
const scrolls = (box: Element) => getComputedStyle(box).overflowY !== 'visible';

const behavior = (): ScrollBehavior =>
  matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth';

const show = (line: HTMLElement) => {
  const box = line.closest<HTMLElement>('[data-follow]');
  if (box === null) return;
  if (scrolls(box)) {
    box.scrollTo({
      top: line.offsetTop - box.clientHeight / 3,
      behavior: behavior(),
    });
    return;
  }
  const pinned =
    document.querySelector('[data-pinned]')?.getBoundingClientRect().bottom ??
    0;
  window.scrollTo({
    top:
      line.getBoundingClientRect().top +
      window.scrollY -
      pinned -
      (window.innerHeight - pinned) / 3,
    behavior: behavior(),
  });
};

export function Transcript({
  lines,
  player,
}: {
  readonly lines: ReadonlyArray<Line>;
  readonly player: Player;
}) {
  const playing = usePlaying(player, lines);
  const [following, setFollowing] = useState(true);
  // Shown once even while paused: after "Back to now" or a tap.
  const asked = useRef(false);

  const follow = useCallback(
    (line: HTMLElement | null) => {
      if (line === null || !(player.playing() || asked.current)) return;
      asked.current = false;
      show(line);
    },
    [player],
  );

  // A wheel, a finger or a key moving what holds the lines stops following.
  const watch = useCallback((box: HTMLElement | null) => {
    if (box === null) return;
    const away = (event: Event) => {
      const target = event.target instanceof Element ? event.target : null;
      if (target?.closest('video, input, textarea, [role=tablist]')) return;
      if (scrolls(box) && !(target && box.contains(target))) return;
      setFollowing(false);
    };
    const key = (event: KeyboardEvent) => {
      if (SCROLL_KEYS.has(event.key)) away(event);
    };
    window.addEventListener('wheel', away, { passive: true });
    window.addEventListener('touchmove', away, { passive: true });
    window.addEventListener('keydown', key);
    return () => {
      window.removeEventListener('wheel', away);
      window.removeEventListener('touchmove', away);
      window.removeEventListener('keydown', key);
    };
  }, []);

  const resume = () => {
    asked.current = true;
    setFollowing(true);
  };

  if (lines.length === 0)
    return (
      <p className="py-3 text-sm text-muted-foreground">Nothing was said.</p>
    );
  return (
    <div
      ref={watch}
      data-follow
      className="relative lg:h-full lg:overflow-y-auto lg:overscroll-contain"
    >
      <ol className="space-y-px pr-1">
        {lines.map((line, index) => (
          <li
            key={index}
            ref={index === playing && following ? follow : undefined}
          >
            <button
              type="button"
              onClick={() => {
                resume();
                player.seek(line.start);
              }}
              aria-current={index === playing || undefined}
              className="grid min-h-11 w-full grid-cols-[3.25rem_1fr] gap-2 rounded-md px-2 py-2.5 text-left text-[15px] leading-6 text-foreground/85 transition-colors duration-150 hover:bg-muted/60 aria-current:bg-muted aria-current:text-foreground motion-reduce:transition-none lg:py-1.5"
            >
              <span className="pt-px text-xs leading-6 text-muted-foreground tabular-nums">
                {clock(line.start)}
              </span>
              <span>{line.text}</span>
            </button>
          </li>
        ))}
      </ol>
      {!following && (
        <div className="pointer-events-none sticky bottom-[calc(1rem+env(safe-area-inset-bottom))] flex justify-center pt-3">
          <button
            type="button"
            onClick={resume}
            className="pointer-events-auto flex h-11 items-center gap-1.5 rounded-full border border-border bg-background px-4 text-sm shadow-sm transition-transform duration-150 ease-out active:scale-[0.96] motion-reduce:transition-none"
          >
            <ArrowDownIcon className="size-4" /> Back to now
          </button>
        </div>
      )}
    </div>
  );
}
