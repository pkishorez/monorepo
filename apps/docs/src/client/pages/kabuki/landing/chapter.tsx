import type { ReactNode } from 'react';
import { Stop } from '../../../field/index.ts';
import type { ShapeName } from '../../../field/index.ts';

/*
 * One stop on the page, a Stop on the field as the home page's chapters
 * are: its number and label, its title, and its words. Its shape takes the
 * half of a wide screen `side` names, the words the other. The shapes
 * are small diagrams, so each takes less scroll than the home page's.
 */

export function Chapter({
  shape,
  side,
  number,
  label,
  id,
  title,
  children,
}: {
  readonly shape: ShapeName;
  readonly side: 'left' | 'right';
  /** Counted stops show their number before the label. */
  readonly number?: number;
  readonly label: string;
  readonly id: string;
  readonly title: ReactNode;
  readonly children: ReactNode;
}) {
  return (
    <Stop shape={shape} side={side} tight aria-labelledby={id}>
      <p className="flex items-center gap-3 font-mono text-xs text-muted-foreground">
        {number !== undefined && (
          <span className="tabular-nums">{`${number}`.padStart(2, '0')}</span>
        )}
        <span aria-hidden className="h-px w-8 bg-border" />
        {label}
      </p>
      <h2
        id={id}
        className="mt-4 text-4xl font-semibold tracking-tight text-balance sm:mt-5 sm:text-5xl"
      >
        {title}
      </h2>
      {children}
    </Stop>
  );
}
