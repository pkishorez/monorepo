import type { DataOf } from '@kestack/kabuki/types';
import type { SidebarShape, Tab } from './shape.js';

export const tabOf = (
  { model }: DataOf<typeof SidebarShape>,
  fakes: boolean,
): Tab => (fakes ? (model.tab ?? 'world') : 'chat');
