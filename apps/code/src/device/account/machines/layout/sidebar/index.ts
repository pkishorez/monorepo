import { SidebarLive } from './actor.ts';
import { Foot } from './edges/foot/foot.tsx';
import { PullToReload } from './edges/header/pull/pull.tsx';
import {
  SidebarReady,
  SidebarView,
  SidebarWidth,
  Sizing,
  type Width,
} from './view.tsx';

export type { Width };

export const Sidebar = {
  actor: SidebarLive,
  view: SidebarView,
  /** Draws nothing; says once it can be drawn whole. */
  ready: SidebarReady,
  Foot,
  PullToReload,
  /** The screen around it, drawn at its width. */
  width: SidebarWidth,
  Sizing,
};
