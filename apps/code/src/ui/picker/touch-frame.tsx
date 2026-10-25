import { Drawer, TopDialog } from '@kestack/web-platform/recipes/touch-layers';
import type { ReactNode } from 'react';
import type { Change, Mode } from './shape.ts';

/*
 * A Picker opened by touch, in the Picker Mode its opener
 * chose: a Drawer rising from the bottom, kept while it slides away, as
 * tall as its rows or, `tall`, three quarters of the screen; or a Dialog
 * at the top, there only while it is open.
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
  return mode === 'drawer' ? (
    <Drawer open={open} onOpenChange={onOpenChange} label={label} tall={tall}>
      {children}
    </Drawer>
  ) : (
    <TopDialog open={open} onOpenChange={onOpenChange} label={label}>
      {children}
    </TopDialog>
  );
}
