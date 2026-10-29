import { View } from '@kestack/kabuki/react';
import { DraftLive } from './actor.ts';
import { DraftMode } from './write/view.tsx';
import { Slots } from './draft.ts';
import { Starting } from './send/starting.tsx';

/*
 * Its View, and the Touch Draft's, load apart from the app's first code,
 * the editor with them, so home's first paint has neither.
 */
const view = View.lazy(DraftLive, () => import('./view.tsx'));

export const Draft = {
  actor: DraftLive,
  view,
  Slots,
  /** A new session's steps as it starts, drawn by the page where its transcript will be. */
  Starting,
  /** Load its code, and the Touch Draft's, before it is drawn. */
  preload: () =>
    Promise.all([view.preload(), DraftMode.preload()]).then(() => {}),
};
