import { ChevronsLeftIcon, ChevronsRightIcon } from 'lucide-react';
import { type ReactNode, useEffect, useRef, useState } from 'react';
import {
  BOTTOM_BAR,
  DOUBLE_TAP_MS,
  doubles,
  isTap,
  SIDE,
  SKIP,
  sideOf,
  type Side,
  type Tap,
  TOP_BAR,
} from '../../../touch/index.ts';
import type { Player } from './player.ts';

/*
 * Two quick taps on the left or right of the short video skip it 10 s
 * back or forward, as YouTube's do, and each tap after keeps skipping.
 * The first tap is the player's own, which shows its controls; only then
 * does a clear layer over that side catch the taps that follow, so the
 * player never sees a double tap of its own (Chrome on Android's seek, a
 * double click's fullscreen). The layer keeps clear of the middle, where
 * play and pause are, and of the player's bars at the top and bottom;
 * fullscreen is the player's alone. A mouse is left to the player.
 */

/** How long "10 s" shows after the last skip, in ms. */
const SHOWN_MS = 650;

const PLACE: Readonly<Record<Side, string>> = {
  back: 'left-0',
  forward: 'right-0',
};

export function DoubleTap({
  player,
  children,
}: {
  readonly player: Player;
  readonly children: ReactNode;
}) {
  const box = useRef<HTMLDivElement>(null);
  const last = useRef<Tap | null>(null);
  const disarm = useRef<ReturnType<typeof setTimeout>>(undefined);
  const unshow = useRef<ReturnType<typeof setTimeout>>(undefined);
  const [armed, setArmed] = useState<Side | null>(null);
  const [skipped, setSkipped] = useState<{
    readonly side: Side;
    readonly seconds: number;
  } | null>(null);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const element = box.current;
    if (element === null) return;
    // Where and when the touch landed: one that moved or stayed is no tap.
    let landed: { x: number; y: number; t: number } | null = null;
    const start = (event: TouchEvent) => {
      const [touch] = event.touches;
      landed =
        event.touches.length === 1 && touch !== undefined
          ? { x: touch.clientX, y: touch.clientY, t: event.timeStamp }
          : null;
    };
    const end = (event: TouchEvent) => {
      const [touch] = event.changedTouches;
      if (event.touches.length > 0 || touch === undefined) return;
      const from = landed;
      landed = null;
      if (
        from === null ||
        !isTap(
          touch.clientX - from.x,
          touch.clientY - from.y,
          event.timeStamp - from.t,
        )
      ) {
        last.current = null;
        return;
      }
      const rect = element.getBoundingClientRect();
      const side = sideOf(
        touch.clientX - rect.left,
        touch.clientY - rect.top,
        rect.width,
        rect.height,
      );
      clearTimeout(disarm.current);
      if (side === null) {
        last.current = null;
        setArmed(null);
        return;
      }
      const tap = { side, t: event.timeStamp };
      if (doubles(last.current, tap)) {
        if (event.cancelable) event.preventDefault();
        player.skip(side);
        setSkipped((was) => ({
          side,
          seconds: was?.side === side ? was.seconds + SKIP : SKIP,
        }));
        setShown(true);
        clearTimeout(unshow.current);
        unshow.current = setTimeout(() => {
          setShown(false);
          setSkipped(null);
        }, SHOWN_MS);
      }
      last.current = tap;
      setArmed(side);
      disarm.current = setTimeout(() => {
        last.current = null;
        setArmed(null);
      }, DOUBLE_TAP_MS);
    };
    element.addEventListener('touchstart', start, {
      capture: true,
      passive: true,
    });
    element.addEventListener('touchend', end, {
      capture: true,
      passive: false,
    });
    return () => {
      element.removeEventListener('touchstart', start, { capture: true });
      element.removeEventListener('touchend', end, { capture: true });
      clearTimeout(disarm.current);
      clearTimeout(unshow.current);
    };
  }, [player]);

  return (
    <div ref={box} className="relative h-full">
      {children}
      {(['back', 'forward'] as const).map((side) => (
        <div
          key={side}
          aria-hidden
          data-tap-zone={side}
          className={`absolute flex items-center justify-center ${PLACE[side]}`}
          style={{
            top: TOP_BAR,
            bottom: BOTTOM_BAR,
            width: `${SIDE * 100}%`,
            pointerEvents: armed === side ? 'auto' : 'none',
            touchAction: 'manipulation',
          }}
        >
          <span
            data-skipped={(shown && skipped?.side === side) || undefined}
            className="flex items-center gap-1 rounded-full bg-black/65 py-1.5 pr-3 pl-2 text-sm font-medium text-white tabular-nums opacity-0 transition-opacity duration-150 ease-out motion-reduce:transition-none data-skipped:opacity-100"
          >
            {side === 'back' ? (
              <ChevronsLeftIcon className="size-4" />
            ) : (
              <ChevronsRightIcon className="size-4" />
            )}
            {skipped?.side === side ? skipped.seconds : SKIP} s
          </span>
        </div>
      ))}
    </div>
  );
}
