import type { ReactNode, Ref } from 'react';

/**
 * The one drawing a demo is: a bordered container whose border is the Edge.
 * The Views draw in the middle; `below` (the Strip) sits under them and
 * `overlay` (the Marbles) floats over everything.
 */
export const Picture = ({
  ref,
  children,
  below,
  overlay,
}: {
  readonly ref?: Ref<HTMLDivElement>;
  /** The shapes the Views draw. */
  readonly children: ReactNode;
  /** What sits under the drawing, inside the Edge: the Strip. */
  readonly below?: ReactNode;
  /** What floats over the whole Picture: the Marbles. */
  readonly overlay?: ReactNode;
}) => (
  <div
    ref={ref}
    data-picture
    className="relative flex h-full flex-col overflow-hidden border bg-background sm:rounded-lg"
  >
    <div className="relative flex min-h-0 flex-1 flex-col items-center justify-center gap-6 overflow-hidden p-6">
      {children}
    </div>
    {below}
    {overlay}
  </div>
);
