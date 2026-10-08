import { cn } from 'cn';
import type { CSSProperties, ReactNode } from 'react';
import { Frame, useFrame } from './frame/index.ts';
import { Header, type HeaderConfig } from './header.tsx';
import { type SidebarConfig, SidebarContents } from './sidebar/index.ts';

export { useSidebarWidth } from './sidebar/index.ts';

export {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarInput,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSkeleton,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
} from './sidebar/index.ts';

/**
 * An app's whole screen: an optional sidebar, an optional header, and the
 * page, which scrolls under the header. Mobile first: on a phone the page
 * moves aside and shrinks to show the sidebar, under a finger on a touch
 * screen; on a wide screen the sidebar sits beside the page, which is a card.
 * One open state serves every size. Without a sidebar the page fills the
 * screen, and the header's actions hold what the sidebar's footer would.
 */
export function AppShell(props: {
  readonly sidebar?: SidebarConfig;
  readonly header?: HeaderConfig;
  /** Where a swipe that opens the sidebar may start, on a touch screen. */
  readonly swipe?: 'anywhere' | 'edge' | 'off';
  /** Drawn outside the moving page, told whether the sidebar is open. */
  readonly statusBar?: (open: boolean) => ReactNode;
  readonly className?: string;
  readonly style?: CSSProperties;
  /** The page. */
  readonly children: ReactNode;
}) {
  const { sidebar, header } = props;
  return (
    <Frame
      sidebar={
        sidebar === undefined ? undefined : <SidebarContents config={sidebar} />
      }
      sidebarWidth={sidebar?.width}
      swipe={props.swipe ?? 'anywhere'}
      statusBar={props.statusBar}
      className={props.className}
      style={props.style}
    >
      {header === undefined ? null : <Header config={header} />}
      <div
        data-slot="app-shell-scroller"
        className={cn(
          'min-h-0 flex-1 overflow-y-auto overscroll-contain',
          // Without a header, the page itself keeps clear of the status bar.
          header === undefined && 'pt-[env(safe-area-inset-top)]',
        )}
      >
        {props.children}
      </div>
    </Frame>
  );
}

/** Whether the sidebar is open, to open or shut it, and whether it's a phone. */
export function useAppShell() {
  const { open, setOpen, toggle, isMobile } = useFrame();
  return { open, setOpen, toggle, isMobile };
}
