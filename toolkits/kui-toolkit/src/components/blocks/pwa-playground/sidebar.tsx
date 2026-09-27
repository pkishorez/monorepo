import { createContext, type ReactNode, useContext } from 'react';
import { motion, useTransform } from 'motion/react';
import { useSwipe, type GestureSpring } from '../gestures';

const SIDEBAR_WIDTH = 288;

const useSidebarMotion = (spring?: GestureSpring) => {
  const sidebar = useSwipe({
    direction: 'right',
    edge: false,
    after: 'stay',
    distance: SIDEBAR_WIDTH,
    spring,
  });
  const { progress } = sidebar;
  return {
    ...sidebar,
    panelX: useTransform(progress, [0, 1], [-SIDEBAR_WIDTH, 0]),
    scrimOpacity: useTransform(progress, [0, 1], [0, 0.4]),
    scrimEvents: useTransform(progress, (value) =>
      value > 0.02 && progress.getVelocity() >= 0 ? 'auto' : 'none',
    ),
    contentX: useTransform(progress, [0, 1], [0, 40]),
    contentScale: useTransform(progress, [0, 1], [1, 0.94]),
    contentRadius: useTransform(progress, [0, 1], [0, 20]),
  };
};

type SidebarController = ReturnType<typeof useSidebarMotion>;

const SidebarContext = createContext<SidebarController | undefined>(undefined);

export const usePwaPlaygroundSidebar = (): SidebarController => {
  const sidebar = useContext(SidebarContext);
  if (sidebar === undefined) {
    throw new Error(
      'usePwaPlaygroundSidebar must be used inside PwaPlaygroundSidebar',
    );
  }
  return sidebar;
};

/**
 * The PWA Gesture Lab sidebar. Its settle spring can be overridden for live
 * product tuning; drag tracking always remains one-to-one with the finger.
 */
export function PwaPlaygroundSidebar(props: {
  readonly panel: ReactNode;
  readonly children: ReactNode;
  readonly spring?: GestureSpring;
  /** Uses absolute positioning so the sidebar can be exercised in Cosmos. */
  readonly contained?: boolean;
}) {
  const sidebar = useSidebarMotion(props.spring);
  const position = props.contained ? 'absolute' : 'fixed';
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
          position,
        }}
        className="inset-0 z-30 bg-black"
      />
      <motion.nav
        aria-label="Gesture Lab"
        data-testid="lab-sidebar"
        style={{ x: sidebar.panelX, width: SIDEBAR_WIDTH, position }}
        className="inset-y-0 left-0 z-40 flex flex-col border-r border-sidebar-border bg-sidebar pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] pl-[env(safe-area-inset-left)] text-sidebar-foreground shadow-lg"
      >
        {props.panel}
      </motion.nav>
    </SidebarContext>
  );
}
