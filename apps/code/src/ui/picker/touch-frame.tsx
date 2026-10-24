import { Drawer, TopDialog } from '@kestack/web-platform/recipes/touch-layers';
import type { ReactNode } from 'react';
import type { Change, Mode } from './shape.ts';

/*
 * A Picker on a device with no keyboard, in the Picker Mode its opener
 * chose: a Drawer rising from the bottom, kept while it slides away, or a
 * Dialog at the top, there only while it is open.
 */

export function Touch({
  mode,
  open,
  onOpenChange,
  label,
  children,
}: {
  readonly mode: Mode;
  readonly open: boolean;
  readonly onOpenChange: Change;
  readonly label: string;
  readonly children: ReactNode;
}) {
  const Layer = mode === 'drawer' ? Drawer : TopDialog;
  return (
    <Layer open={open} onOpenChange={onOpenChange} label={label}>
      {children}
    </Layer>
  );
}
