import { type Pointers, useGesture } from '@kstackz/use-gesture/core';
import { motion, useMotionValueEvent } from '@kstackz/ui-toolkit/motion';
import { cn } from '@kstackz/ui-toolkit/utils';
import { type ReactNode, useState } from 'react';
import { createPortal } from 'react-dom';

/**
 * A ring under every finger of the Gesture its zone hears, drawn over the
 * whole screen, so what the demo does can be read against the touch.
 */
export function Fingers() {
  const { pointers } = useGesture();
  const [shown, setShown] = useState<Pointers>(pointers.get());
  useMotionValueEvent(pointers, 'change', setShown);
  if (typeof document === 'undefined') return null;
  return createPortal(
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 z-[70] overflow-hidden"
    >
      {[...shown.values()].map((pointer) => (
        <motion.div
          key={pointer.id}
          style={{ x: pointer.x, y: pointer.y }}
          className={cn(
            'absolute top-0 left-0 -mt-6 -ml-6 size-12 rounded-full border-[3px] border-foreground/60 bg-foreground/10',
            pointer.end !== undefined && 'opacity-30',
          )}
        />
      ))}
    </div>,
    document.body,
  );
}

/** A phone-sized screen for demos that are whole app screens. */
export function Phone(props: {
  readonly children: ReactNode;
  readonly className?: string;
}) {
  return (
    <div
      className={cn(
        'relative flex h-[30rem] max-h-[64svh] w-full max-w-[22rem] flex-col overflow-hidden rounded-[1.75rem] bg-background shadow-lg ring-1 ring-foreground/15',
        props.className,
      )}
    >
      {props.children}
    </div>
  );
}

export const MAIL = Array.from({ length: 24 }, (_, i) => ({
  id: i,
  from: ['Ada', 'Grace', 'Linus', 'Margaret', 'Alan', 'Barbara'][i % 6] ?? '',
  subject:
    [
      'Lunch on Friday?',
      'The build is green again',
      'Notes from the review',
      'Tickets for Saturday',
      'Your invoice',
      'Re: the sidebar spring',
    ][i % 6] ?? '',
}));

export const px = (v: number) => `${Math.round(v)}px`;
export const pct = (v: number) => `${Math.round(v * 100)}%`;
