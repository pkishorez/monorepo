import type { ReactNode } from 'react';
import { type Nav, NavList } from './nav.tsx';
import { ResizeHandle } from './resize-handle.tsx';

/** What an app puts in its sidebar. */
export interface SidebarConfig {
  /** Top: the app, and a way back. */
  readonly header?: ReactNode;
  /** Middle: where you can go, as a list of groups… */
  readonly nav?: Nav;
  /** …or anything the list can't describe, built from the Sidebar pieces. */
  readonly content?: ReactNode;
  /** Bottom: who you are. */
  readonly footer?: ReactNode;
  /** Its width on a wide screen, in px: 256 unless set. */
  readonly width?: number;
  /** Lets people resize it by its edge on a wide screen. */
  readonly onWidthChange?: (width: number) => void;
}

/** The sidebar, top to bottom: header, places, footer, and its edge. */
export function SidebarContents(props: { readonly config: SidebarConfig }) {
  const { config } = props;
  return (
    <>
      {config.header === undefined ? null : (
        <div className="flex flex-col gap-2 p-2">{config.header}</div>
      )}
      <div className="no-scrollbar flex min-h-0 flex-1 flex-col gap-2 overflow-auto">
        {config.content ??
          (config.nav === undefined ? null : <NavList nav={config.nav} />)}
      </div>
      {config.footer === undefined ? null : (
        <div className="flex flex-col gap-2 p-2">{config.footer}</div>
      )}
      {config.onWidthChange === undefined ? null : (
        <ResizeHandle
          width={config.width ?? 256}
          onWidthChange={config.onWidthChange}
        />
      )}
    </>
  );
}
