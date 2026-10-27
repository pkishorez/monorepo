import { cn } from 'cn';
import type { CSSProperties, ReactElement, ReactNode } from 'react';
import { Frame, useFrame } from './frame/index.ts';
import { Header, type HeaderConfig } from './header.tsx';
import { type SidebarConfig, SidebarContents } from './sidebar/index.ts';
import { VimWindow } from './vim-window.tsx';

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
  /**
   * The Sidebar Mode, how the sidebar shows on a narrow screen: `slide`, the
   * default, slides it in beside the page; `fullscreen` makes it the whole
   * screen, a page of its own, and the header's button a way back to it.
   */
  readonly sidebarMode?: 'slide' | 'fullscreen';
  /** Drawn outside the moving page, told whether the sidebar is open. */
  readonly statusBar?: (open: boolean) => ReactNode;
  /**
   * use-keys' Vim Mode: with `on`, `statusLine`, such as a `KeysStatusBar`,
   * eases in as the shell's bottom edge.
   */
  readonly vim?: { readonly on: boolean; readonly statusLine?: ReactNode };
  /**
   * The whole shell floats as a window inset from the viewport, once the
   * screen is wider than the window can be. Off by default: the shell is
   * the whole screen at every width.
   */
  readonly floating?: boolean;
  /**
   * Wraps the page's column, the header with the page under it, in one
   * element, such as a use-keys `keys.Surface asChild`, so the header is
   * part of it. It must render the column it is given.
   */
  readonly column?: (column: ReactElement) => ReactNode;
  readonly className?: string;
  readonly style?: CSSProperties;
  /** The page. */
  readonly children: ReactNode;
}) {
  const { sidebar, header } = props;
  return (
    <VimWindow
      floating={props.floating === true}
      on={props.vim?.on === true}
      statusLine={props.vim?.statusLine}
    >
      <Frame
        sidebar={
          sidebar === undefined ? undefined : (
            <SidebarContents config={sidebar} />
          )
        }
        sidebarWidth={sidebar?.width}
        onSidebarWidthChange={sidebar?.onWidthChange}
        swipe={props.swipe ?? 'anywhere'}
        sidebarMode={props.sidebarMode ?? 'slide'}
        statusBar={props.statusBar}
        className={props.className}
        style={props.style}
      >
        {(props.column ?? same)(
          <div
            data-slot="app-shell-column"
            className="flex min-h-0 flex-1 flex-col rounded-[inherit]"
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
          </div>,
        )}
      </Frame>
    </VimWindow>
  );
}

const same = (column: ReactElement) => column;

/** Whether the sidebar is open, to open or shut it, and whether it's a phone. */
export function useAppShell() {
  const { open, setOpen, toggle, isMobile } = useFrame();
  return { open, setOpen, toggle, isMobile };
}
