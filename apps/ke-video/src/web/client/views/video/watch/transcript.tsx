import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { ArrowDownIcon } from 'lucide-react';
import type { Line } from '../../../../../video/library/schema.ts';
import { clock } from '../../../format/index.ts';
import { useWindowed } from '../../parts/index.ts';
import { type Player, usePlaying } from './player.ts';

/*
 * The trimmed transcript, in the short video's times. The line being
 * played is marked, and kept a third of the way down what can be seen:
 * in its own box from a laptop up, on the page itself on a phone, below
 * the pinned player and tabs, while its tab is the one open. A hand
 * scrolling it stops that, until "Back to now", kept at the bottom of the
 * screen, or a tap on a line, which seeks there. Only the lines near what
 * is seen are drawn. Drawn again after a reload, it follows again, from
 * where the video resumed, or else opens at the line it was read from.
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

/** A line's height until it is drawn: its text's lines at about 7.6 px a letter, 24 px each. */
const guess = (text: string) => {
  const wide = innerWidth >= 1024;
  const column = wide ? (innerWidth >= 1280 ? 388 : 324) : innerWidth - 108;
  const rows = Math.max(1, Math.ceil((text.length * 7.6) / column));
  return (wide ? 12 : 20) + 24 * rows + 1;
};

export function Transcript({
  lines,
  player,
  active,
  visible,
  start,
  resumed,
  onFollow,
  onTop,
}: {
  readonly lines: ReadonlyArray<Line>;
  readonly player: Player;
  /** As it was left: whether it followed, and the line at the top. */
  readonly start: { readonly following?: boolean; readonly row?: number };
  /** Where the video resumed, while that shows: the line there is shown. */
  readonly resumed: number | null;
  readonly onFollow: (following: boolean) => void;
  readonly onTop: (row: number) => void;
  /** Whether its tab is the one open: only then does it scroll to the line. */
  readonly active: boolean;
  /** Whether it can be seen, open or sliding in. */
  readonly visible: boolean;
}) {
  const playing = usePlaying(player, lines);
  const [following, setFollowing] = useState(start.following ?? true);
  // Shown once even while paused: after "Back to now" or a tap.
  const asked = useRef(false);
  const box = useRef<HTMLDivElement>(null);
  const keyOf = useCallback((index: number) => String(index), []);
  const estimate = useCallback(
    (index: number) => guess(lines[index]?.text ?? ''),
    [lines],
  );
  const rows = useWindowed({
    count: lines.length,
    keyOf,
    estimate,
    box,
    live: visible,
    onTop: active ? onTop : undefined,
  });
  const followed = active && following;

  useEffect(() => onFollow(following), [following, onFollow]);

  // Once, as it is first drawn open: back to the line it was read from.
  const opened = useRef(false);
  useLayoutEffect(() => {
    if (opened.current || !active || lines.length === 0) return;
    opened.current = true;
    if (following || start.row === undefined) return;
    rows.hold(
      Math.min(start.row, lines.length - 1),
      () =>
        document.querySelector('[data-pinned]')?.getBoundingClientRect()
          .bottom ?? 0,
    );
    // oxlint-disable-next-line react-hooks/exhaustive-deps -- once, as it opens.
  }, [active, lines.length]);

  // The video resumed: its line is shown, though it is paused.
  useEffect(() => {
    if (resumed !== null) asked.current = true;
  }, [resumed]);

  // The line being played, kept a third of the way down.
  useEffect(() => {
    if (!followed || playing < 0) return;
    if (!(player.playing() || asked.current)) return;
    asked.current = false;
    const pinned =
      document.querySelector('[data-pinned]')?.getBoundingClientRect().bottom ??
      0;
    rows.show(playing, pinned, behavior());
    // oxlint-disable-next-line react-hooks/exhaustive-deps -- follows the line and the following alone.
  }, [playing, followed]);

  // A wheel, a finger or a key moving what holds the lines stops following.
  const empty = lines.length === 0;
  useEffect(() => {
    const holder = box.current;
    if (holder === null) return;
    const away = (event: Event) => {
      // A sideways swipe between the tabs holds its touch: it scrolls nothing.
      if (event.defaultPrevented) return;
      const target = event.target instanceof Element ? event.target : null;
      if (target?.closest('video, input, textarea, [role=tablist]')) return;
      if (scrolls(holder) && !(target && holder.contains(target))) return;
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
  }, [empty]);

  const resume = () => {
    asked.current = true;
    setFollowing(true);
  };

  if (empty)
    return (
      <p className="py-3 text-sm text-muted-foreground">Nothing was said.</p>
    );
  return (
    <div
      ref={box}
      data-follow
      className="relative lg:h-full lg:overflow-y-auto lg:overscroll-contain"
    >
      <div className="pt-2 pr-1 lg:pt-0">
        <ol
          ref={rows.list}
          style={{ paddingTop: rows.before, paddingBottom: rows.after }}
        >
          {lines.slice(rows.start, rows.end).map((line, at) => {
            const index = rows.start + at;
            return (
              <li
                key={index}
                ref={rows.measure}
                data-index={index}
                className="pb-px"
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
            );
          })}
        </ol>
      </div>
      {!following && (
        <div className="pointer-events-none sticky bottom-[calc(1rem+env(safe-area-inset-bottom))] z-10 flex justify-center pt-3">
          <button
            type="button"
            onClick={resume}
            className="pointer-events-auto flex h-11 items-center gap-1.5 rounded-full border border-border bg-background px-4 text-sm font-medium shadow-md transition-transform duration-150 ease-out active:scale-[0.96] motion-reduce:transition-none"
          >
            <ArrowDownIcon className="size-4" /> Back to now
          </button>
        </div>
      )}
    </div>
  );
}
