import { useCallback, useEffect, useRef, useState } from 'react';

import type { ClockRange } from './recording-clock';

export const playbackSpeeds = [0.5, 1, 2] as const;

export type PlaybackSpeed = (typeof playbackSpeeds)[number];

export interface Playback {
  readonly range: ClockRange;
  readonly time: number;
  readonly playing: boolean;
  readonly speed: PlaybackSpeed;
  readonly toggle: () => void;
  readonly seek: (time: number) => void;
  readonly setSpeed: (speed: PlaybackSpeed) => void;
}

/**
 * A clock over `range` that advances in real time times `speed` while
 * playing. It rests at `cue` until played or sought.
 */
export function usePlayback(range: ClockRange, cue: number): Playback {
  const [time, setTime] = useState(cue);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState<PlaybackSpeed>(1);
  const timeRef = useRef(time);
  timeRef.current = time;

  useEffect(() => {
    setTime(cue);
    setPlaying(false);
  }, [range.start, range.end, cue]);

  useEffect(() => {
    if (!playing) return;
    let last = performance.now();
    let frame = requestAnimationFrame(function tick(now) {
      const next = Math.min(range.end, timeRef.current + (now - last) * speed);
      last = now;
      timeRef.current = next;
      setTime(next);
      if (next >= range.end) {
        setPlaying(false);
        return;
      }
      frame = requestAnimationFrame(tick);
    });
    return () => cancelAnimationFrame(frame);
  }, [playing, speed, range.end]);

  const toggle = useCallback(() => {
    if (!playing && timeRef.current >= range.end) setTime(range.start);
    setPlaying(!playing);
  }, [playing, range.start, range.end]);

  const seek = useCallback(
    (next: number) => setTime(Math.min(range.end, Math.max(range.start, next))),
    [range.start, range.end],
  );

  return { range, time, playing, speed, toggle, seek, setSpeed };
}
