import { buttonVariants } from '@kstackz/ui-toolkit/components/ui/button';
import { ChevronLeftIcon, ChevronRightIcon } from '@kstackz/ui-toolkit/lucide';
import { useGesture } from '@kstackz/use-gesture/core';
import { useState } from 'react';
import { useStageStatus } from '../../stage/index.ts';

const EDGE = 24;

/**
 * The whole screen is a zone, so a touch landing within 24px of a side edge
 * is kept from the browser's back swipe. Buttons at the edge still click.
 */
export function ScreenEdges() {
  const [said, setSaid] = useState<string>();
  useGesture({
    onStart: (pointers) => {
      const [first] = pointers.values();
      if (first === undefined) return;
      const edge = first.start.x < EDGE || first.start.x > innerWidth - EDGE;
      setSaid(edge ? 'The edge: kept from the browser' : undefined);
    },
  });
  useStageStatus(said);

  const button = (className: string) =>
    buttonVariants({ variant: 'secondary', size: 'icon', className });

  return (
    <>
      <div
        className="absolute inset-y-0 left-0 bg-primary/10"
        style={{ width: EDGE }}
      />
      <div
        className="absolute inset-y-0 right-0 bg-primary/10"
        style={{ width: EDGE }}
      />
      <div className="absolute inset-x-0 top-1/2 flex -translate-y-1/2 justify-between">
        <button
          type="button"
          aria-label="Left button"
          className={button('size-11 rounded-l-none')}
          onClick={() => setSaid('The left button clicked')}
        >
          <ChevronLeftIcon aria-hidden="true" />
        </button>
        <button
          type="button"
          aria-label="Right button"
          className={button('size-11 rounded-r-none')}
          onClick={() => setSaid('The right button clicked')}
        >
          <ChevronRightIcon aria-hidden="true" />
        </button>
      </div>
    </>
  );
}
