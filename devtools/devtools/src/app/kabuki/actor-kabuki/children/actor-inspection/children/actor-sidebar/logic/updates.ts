import type { InitOf, UpdatesOf } from '@kestack/kabuki/types';
import type { SidebarShape } from './shared/index.js';

export const init: InitOf<typeof SidebarShape> = ({ name, app }) => ({
  model: { name, app, tab: null },
});

export const updates: UpdatesOf<typeof SidebarShape> = {
  Tabbed: ({ tab }) => ({ model: { tab } }),
};
