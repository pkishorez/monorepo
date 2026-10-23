import { SidebarLive } from './actor.ts';
import { SettingsLink } from './sidebar.tsx';
import { SidebarView, Slots } from './view.tsx';

export const Sidebar = {
  actor: SidebarLive,
  view: SidebarView,
  Slots,
  SettingsLink,
};
