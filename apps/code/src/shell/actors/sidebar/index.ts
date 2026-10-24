import { SidebarLive } from './actor.ts';
import { PullToReload } from './pull/index.ts';
import { SettingsLink } from './sidebar.tsx';
import { SidebarView, Slots } from './view.tsx';

export const Sidebar = {
  actor: SidebarLive,
  view: SidebarView,
  Slots,
  SettingsLink,
  PullToReload,
};
