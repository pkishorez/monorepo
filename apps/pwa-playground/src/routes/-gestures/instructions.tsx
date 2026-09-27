import { Button } from 'kui-toolkit/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from 'kui-toolkit/components/ui/dialog';
import { CircleQuestionMarkIcon } from 'kui-toolkit/lucide';
import type { ReactNode } from 'react';

type Finger = {
  readonly x: number;
  /** Held still: drawn filled, with a ring. */
  readonly held?: boolean;
  readonly moves?: 'sideways' | 'both';
  readonly double?: boolean;
};

const sideways = (x: number) =>
  `M${x - 8} 16H${x - 14}m2-2-2 2 2 2M${x + 8} 16H${x + 14}m-2-2 2 2-2 2`;
const upDown = (x: number) => `M${x} 8V2m-2 2 2-2 2 2M${x} 24v6m-2-2 2 2 2-2`;

/** Fingers as dots on a 56×32 pad, with arrows for how they move. */
function Diagram(props: { readonly fingers: ReadonlyArray<Finger> }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 56 32"
      className="h-8 w-14 shrink-0 fill-none stroke-current text-muted-foreground"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {props.fingers.map((finger) => (
        <g key={finger.x}>
          <circle
            cx={finger.x}
            cy={16}
            r={4}
            className={finger.held ? 'fill-current' : undefined}
          />
          {finger.held ? <circle cx={finger.x} cy={16} r={7.5} /> : null}
          {finger.double ? (
            <>
              <circle cx={finger.x} cy={16} r={8} opacity={0.6} />
              <circle cx={finger.x} cy={16} r={12} opacity={0.3} />
            </>
          ) : null}
          {finger.moves === undefined ? null : <path d={sideways(finger.x)} />}
          {finger.moves === 'both' ? <path d={upDown(finger.x)} /> : null}
        </g>
      ))}
    </svg>
  );
}

const GESTURES: ReadonlyArray<{
  readonly fingers: ReadonlyArray<Finger>;
  readonly text: ReactNode;
}> = [
  {
    fingers: [{ x: 28 }],
    text: (
      <>
        <b>Tap</b>: a ripple.
      </>
    ),
  },
  {
    fingers: [{ x: 28, double: true }],
    text: (
      <>
        <b>Double tap</b>: the dots bloom.
      </>
    ),
  },
  {
    fingers: [{ x: 28, moves: 'sideways' }],
    text: (
      <>
        <b>Swipe sideways</b>: the dots flow, and coast when you let go.
      </>
    ),
  },
  {
    fingers: [
      { x: 12, held: true },
      { x: 40, moves: 'both' },
    ],
    text: (
      <>
        <b>Hold left, move the right finger</b>: up and down for Pull, sideways
        for Spin.
      </>
    ),
  },
  {
    fingers: [
      { x: 16, moves: 'both' },
      { x: 44, held: true },
    ],
    text: (
      <>
        <b>Hold right, move the left finger</b>: up and down for Size, sideways
        for Hue.
      </>
    ),
  },
];

/** The `?` button and the dialog listing every gesture the page reads. */
export function Instructions(props: { readonly className?: string }) {
  return (
    <Dialog>
      <DialogTrigger
        render={
          <Button
            variant="ghost"
            size="icon"
            className={props.className}
            aria-label="How to use this page"
            data-testid="gestures-help"
          />
        }
      >
        <CircleQuestionMarkIcon aria-hidden="true" />
      </DialogTrigger>
      <DialogContent data-testid="gestures-instructions">
        <DialogHeader>
          <DialogTitle>Gestures</DialogTitle>
          <DialogDescription>
            Touch the lower half; the field above answers. For a chord, put one
            finger down and hold it still, then put the other down.
          </DialogDescription>
        </DialogHeader>
        <ul className="flex flex-col gap-3">
          {GESTURES.map((gesture, index) => (
            <li key={index} className="flex items-center gap-3 text-pretty">
              <Diagram fingers={gesture.fingers} />
              <span>{gesture.text}</span>
            </li>
          ))}
        </ul>
        <p className="text-muted-foreground">
          Scroll up and down anywhere. The sideways row scrolls on its own.
        </p>
      </DialogContent>
    </Dialog>
  );
}
