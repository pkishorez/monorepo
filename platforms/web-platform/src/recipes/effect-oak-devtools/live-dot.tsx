import type { Inspection } from './inspection/index.ts';

/** A small dot: green live, accent in the past, grey stopped. */
export const LiveDot = ({
  inspection,
}: {
  readonly inspection: Inspection;
}) => (
  <span
    className={`size-1.5 rounded-full ${
      !inspection.runtime.running
        ? 'bg-muted-foreground'
        : inspection.live
          ? 'bg-positive'
          : 'bg-primary'
    }`}
  />
);
