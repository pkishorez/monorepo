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
          {finger.moves === undefined ? null : <path d={sideways(finger.x)} />}
          {finger.moves === 'both' ? <path d={upDown(finger.x)} /> : null}
        </g>
      ))}
    </svg>
  );
}

const MODES: ReadonlyArray<{
  readonly fingers: ReadonlyArray<Finger>;
  readonly text: ReactNode;
}> = [
  {
    fingers: [{ x: 28, moves: 'sideways' }],
    text: (
      <>
        <b>One finger</b>: swipe sideways to scroll the grid, tap to light a
        dot, double tap to reset the view.
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
        <b>Left finger locked</b>: pan to move the grid, tap to drop a pin,
        double tap to clear the pins.
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
        <b>Right finger locked</b>: pan up or down to zoom, tap to zoom in,
        double tap to zoom to fit the pins.
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
            Touch the lower half; the grid above answers. To lock a finger, keep
            it still and touch with another. It stays locked until you lift it,
            and changes what the other finger does.
          </DialogDescription>
        </DialogHeader>
        <ul className="flex flex-col gap-3">
          {MODES.map((mode, index) => (
            <li key={index} className="flex items-center gap-3 text-pretty">
              <Diagram fingers={mode.fingers} />
              <span>{mode.text}</span>
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
