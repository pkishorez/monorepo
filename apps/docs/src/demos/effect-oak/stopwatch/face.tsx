import { useRef } from 'react';
import type { UseFrame } from 'effect-oak/react';

/** Milliseconds as `MM:SS.cc`, the way Foldkit's stopwatch reads. */
const clock = (ms: number) => {
  const pad = (n: number) => String(Math.floor(n)).padStart(2, '0');
  return `${pad(ms / 60_000)}:${pad((ms % 60_000) / 1000)}.${pad((ms % 1000) / 10)}`;
};

/** The time on the stopwatch, written at each Frame without a render. */
export const Face = ({
  useFrame,
  elapsed,
}: {
  readonly useFrame: UseFrame;
  readonly elapsed: (at: number) => number;
}) => {
  const face = useRef<HTMLParagraphElement>(null);
  useFrame((at) => {
    if (face.current) face.current.textContent = clock(elapsed(at));
  });
  return (
    <p
      ref={face}
      className="font-mono text-6xl font-semibold tabular-nums"
      aria-live="off"
    />
  );
};
