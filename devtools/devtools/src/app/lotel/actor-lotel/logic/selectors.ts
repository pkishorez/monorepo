import type { DataOf } from '@kestack/kabuki/types';
import type { LotelShape } from './shared/index.js';

// 2. Open
/** Whether a Trace is open beside the Feed. */
export const isOpen = ({ model }: DataOf<typeof LotelShape>) =>
  model.opened !== null;

/** The Trace open beside the Feed; '' while none is. */
export const openedOf = ({ model }: DataOf<typeof LotelShape>) =>
  model.opened ?? '';
