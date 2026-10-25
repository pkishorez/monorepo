import { Drawer } from '@kestack/web-platform/recipes/touch-layers';
import type { ReactNode } from 'react';
import type { Change, Mode } from './shape.ts';

/*
 * A Picker opened by touch, in the Picker Mode its opener chose, always a
 * Drawer rising from the bottom, kept while it slides away, closed by a
 * swipe down or a tap on what it dims: as tall as its rows or, `tall`,
 * three quarters of the screen; or a Sheet, three quarters tall with a
 * search, which rises over the on-screen keyboard once it is tapped.
 */

export function Touch({
  mode,
  open,
  onOpenChange,
  label,
  tall,
  children,
}: {
  readonly mode: Mode;
  readonly tall: boolean;
  readonly open: boolean;
  readonly onOpenChange: Change;
  readonly label: string;
  readonly children: ReactNode;
}) {
  return (
    <Drawer
      open={open}
      onOpenChange={onOpenChange}
      label={label}
      tall={tall || mode === 'sheet'}
    >
      {children}
    </Drawer>
  );
}
