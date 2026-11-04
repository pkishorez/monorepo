import { cn } from '@kestack/web-platform/ui/components/utils';
import type { ReactNode } from 'react';

/*
 * A slot: each of what it can hold layered in one cell, drawn always,
 * one shown. Shown, it sharpens and grows in on a firm ease-out; hidden,
 * it shrinks deep and blurs away a little faster, and takes no tap. A
 * CSS transition on what is always drawn, so a change reversed half way
 * turns back from where it is.
 */

const SWAP = cn(
  'col-start-1 row-start-1 flex',
  'transition-[opacity,scale,filter] duration-200 ease-[cubic-bezier(0.4,0,1,1)] motion-reduce:transition-none',
  'not-data-shown:pointer-events-none not-data-shown:scale-30 not-data-shown:opacity-0 not-data-shown:blur-[3px]',
  'data-shown:duration-300 data-shown:ease-[cubic-bezier(0.25,0.1,0,1)]',
);

/** Each of `items` layered in one cell, `shown` the one shown. */
export function Slot<Key extends string>({
  shown,
  items,
}: {
  readonly shown: Key;
  readonly items: Readonly<Record<Key, ReactNode>>;
}) {
  return (
    <div className="grid shrink-0 place-items-center">
      {(Object.entries(items) as Array<[Key, ReactNode]>).map(([key, item]) => (
        <div
          key={key}
          data-shown={key === shown || undefined}
          inert={key !== shown}
          className={SWAP}
        >
          {item}
        </div>
      ))}
    </div>
  );
}
