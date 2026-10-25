import { SidebarLive } from './actor.ts';
import { Foot } from './foot.tsx';
import { PullToReload } from './pull/index.ts';
import { SidebarView } from './view.tsx';

export const Sidebar = {
  actor: SidebarLive,
  view: SidebarView,
  Foot,
  PullToReload,
};
