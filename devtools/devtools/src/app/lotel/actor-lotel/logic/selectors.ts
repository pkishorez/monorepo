import type { DataOf } from '@kestack/kabuki/types';
import type { LotelShape } from './shared/index.js';

export const isOpen = ({ model }: DataOf<typeof LotelShape>) =>
  model.opened !== null;

export const openedOf = ({ model }: DataOf<typeof LotelShape>) =>
  model.opened ?? '';
