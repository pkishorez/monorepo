import { useMemo, useSyncExternalStore } from 'react';
import { lineAt } from '../../../format/index.ts';
import { type Side, skipTo } from '../../../touch/index.ts';

/*
 * The short video's player, as what is drawn beside it reads it: where it
 * is, and a seek. Its time stays in the element; what follows it reads the
 * line being played, so it is drawn again only when that line changes.
 */

const HEARD = ['timeupdate', 'seeked', 'loadedmetadata'] as const;

export class Player {
  private element: HTMLVideoElement | null = null;
  private readonly listeners = new Set<() => void>();

  /** The `<video>`'s ref. */
  readonly attach = (element: HTMLVideoElement | null) => {
    this.element = element;
    if (element === null) return;
    const changed = () => this.listeners.forEach((listener) => listener());
    for (const name of HEARD) element.addEventListener(name, changed);
    return () => {
      for (const name of HEARD) element.removeEventListener(name, changed);
      this.element = null;
    };
  };

  readonly subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  readonly time = () => this.element?.currentTime ?? 0;

  /** The `<video>` itself, once drawn. */
  readonly video = () => this.element;

  /** Goes to `seconds` and plays from there. */
  readonly seek = (seconds: number) => {
    const element = this.element;
    if (element === null) return;
    element.currentTime = seconds;
    element.play().catch(() => {});
  };

  /** Skips 10 s back or forward, playing or paused as it was. */
  readonly skip = (side: Side) => {
    const element = this.element;
    if (element === null) return;
    element.currentTime = skipTo(element.currentTime, side, element.duration);
  };

  readonly pause = () => this.element?.pause();

  readonly playing = () => this.element !== null && !this.element.paused;
}

/** The place in `lines` being played, -1 before the first. */
export const usePlaying = (
  player: Player,
  lines: ReadonlyArray<{ readonly start: number }>,
) =>
  useSyncExternalStore(
    player.subscribe,
    () => lineAt(lines, player.time()),
    () => -1,
  );

/** The same, for what starts `at` a time. */
export const usePlayingAt = (
  player: Player,
  moments: ReadonlyArray<{ readonly at: number }>,
) =>
  usePlaying(
    player,
    useMemo(() => moments.map(({ at }) => ({ start: at })), [moments]),
  );
