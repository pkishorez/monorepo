import { motion } from 'kui-toolkit/motion';
import { createContext, type ReactNode, useContext } from 'react';
import { SIDEBAR_WIDTH, useSidebarGestures } from './gestures.ts';
import sidebarCode from './gestures.ts?raw';

export { sidebarCode };

type Sidebar = ReturnType<typeof useSidebarGestures>;

const SidebarContext = createContext<Sidebar | undefined>(undefined);

/** The lab's sidebar, for anything inside it: its `progress`, `source`, `open` and `close`. */
export const useLabSidebar = (): Sidebar => {
  const sidebar = useContext(SidebarContext);
  if (sidebar === undefined) {
    throw new Error('useLabSidebar must be used inside LabSidebar');
  }
  return sidebar;
};

/**
 * The lab's own sidebar, over `children`: swipe right to pull it in (from
 * the left edge where the app owns it), swipe left or tap the scrim to put
 * it away. The panel, the scrim and the lab behind all move with one value.
 * Render it inside the lab's GestureProvider.
 */
export function LabSidebar(props: {
  readonly panel: ReactNode;
  readonly children: ReactNode;
}) {
  const sidebar = useSidebarGestures();
  return (
    <SidebarContext value={sidebar}>
      <motion.div
        style={{
          x: sidebar.contentX,
          scale: sidebar.contentScale,
          borderRadius: sidebar.contentRadius,
          originX: 1,
        }}
        className="flex h-full flex-col overflow-hidden bg-background"
      >
        {props.children}
      </motion.div>
      <motion.button
        type="button"
        aria-label="Close the menu"
        data-testid="lab-scrim"
        tabIndex={-1}
        onClick={sidebar.close}
        style={{
          opacity: sidebar.scrimOpacity,
          pointerEvents: sidebar.scrimEvents,
        }}
        className="fixed inset-0 z-30 bg-black"
      />
      <motion.nav
        aria-label="Gesture Lab"
        data-testid="lab-sidebar"
        style={{ x: sidebar.panelX, width: SIDEBAR_WIDTH }}
        className="fixed inset-y-0 left-0 z-40 flex flex-col border-r border-sidebar-border bg-sidebar pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] pl-[env(safe-area-inset-left)] text-sidebar-foreground shadow-lg"
      >
        {props.panel}
      </motion.nav>
    </SidebarContext>
  );
}
