import {
  createContext,
  type ReactNode,
  useContext,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Drawer } from '../../components/drawer';
import { useGesture } from '../../input';
import { edgeSwipe } from './edge';

type SidebarState = {
  readonly open: boolean;
  readonly setOpen: (open: boolean) => void;
  readonly toggle: () => void;
};

const SidebarContext = createContext<SidebarState | undefined>(undefined);

/**
 * Holds whether the Sidebar is open, for the Sidebar and anything that
 * opens or shuts it: a menu button, a Command, an edge swipe.
 */
export function SidebarProvider(props: { readonly children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const state = useMemo(
    () => ({ open, setOpen, toggle: () => setOpen((was) => !was) }),
    [open],
  );
  return <SidebarContext value={state}>{props.children}</SidebarContext>;
}

/** Whether the Sidebar is open, and the ways to open and shut it. */
export function useSidebar(): SidebarState {
  const state = useContext(SidebarContext);
  if (state === undefined)
    throw new Error('useSidebar must be inside SidebarProvider');
  return state;
}

/**
 * The Sidebar as a drawer from the start edge, over the app: `header` at its
 * top, `children` scrolling under it, `footer` at its foot. Opened and shut
 * through `useSidebar`; a tap on the backdrop or a drag back shuts it.
 */
export function Sidebar(props: {
  readonly header?: ReactNode;
  readonly footer?: ReactNode;
  readonly children: ReactNode;
}) {
  const { open, setOpen } = useSidebar();
  return (
    <Drawer open={open} onOpenChange={setOpen}>
      <Drawer.Content side="start" size="md" showClose={false}>
        {props.header}
        <Drawer.Body>{props.children}</Drawer.Body>
        {props.footer !== undefined && (
          <Drawer.Footer>{props.footer}</Drawer.Footer>
        )}
      </Drawer.Content>
    </Drawer>
  );
}

/**
 * The Sidebar's edge, inside a GestureSurface: a swipe right of one finger
 * from the left edge of the screen opens it. The edge is its own, so a
 * swipe there never scrolls or goes back a page; a touch of two fingers,
 * such as a Thumb Lock, is left to the others. Closing is the drawer's own
 * drag back.
 */
export function SidebarEdge(props: { readonly enabled?: boolean }) {
  const sidebar = useSidebar();
  const latest = useRef({ sidebar, enabled: props.enabled !== false });
  latest.current = { sidebar, enabled: props.enabled !== false };
  const claim = useRef<() => void>(() => {});
  const listener = useMemo(
    () =>
      edgeSwipe({
        enabled: () => latest.current.enabled && !latest.current.sidebar.open,
        onOpen: () => latest.current.sidebar.setOpen(true),
        claim: () => claim.current(),
        clock: () => performance.now(),
      }),
    [],
  );
  claim.current = useGesture(listener).claim;
  return null;
}
