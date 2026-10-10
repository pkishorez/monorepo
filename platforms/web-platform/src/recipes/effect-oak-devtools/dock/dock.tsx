import type { ReactNode } from 'react';
import { useIsMobile } from '#hooks/use-mobile';
import { BottomSheet, PEEK } from './bottom-sheet.tsx';
import { SidePanel } from './side-panel.tsx';

/**
 * A page with a panel docked beside it: `content` fills the space, and the
 * panel docks right on a wide screen, resizable and foldable, or sits in a
 * sheet on a phone, lowered to `peek` until dragged up. `panel` gets the
 * button that folds it, when there is one.
 */
export const Dock = ({
  label,
  content,
  panel,
  peek,
  folded,
}: {
  readonly label: string;
  readonly content: ReactNode;
  readonly panel: (fold: ReactNode) => ReactNode;
  /** The sheet lowered, given a function that raises it. */
  readonly peek: (raise: () => void) => ReactNode;
  /** What the folded tab shows besides its icon. */
  readonly folded: ReactNode;
}) => {
  const phone = useIsMobile();
  return (
    <div className="relative flex min-h-0 flex-1">
      <div
        className="min-h-0 min-w-0 flex-1 overflow-hidden"
        style={phone ? { paddingBottom: PEEK } : undefined}
      >
        {content}
      </div>
      {phone ? (
        <BottomSheet label={label} peek={peek}>
          {panel(null)}
        </BottomSheet>
      ) : (
        <SidePanel label={label} folded={folded}>
          {panel}
        </SidePanel>
      )}
    </div>
  );
};
