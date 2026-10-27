import { View } from '@kestack/kabuki/react';
import { Kabuki as page, KabukiLive } from './actor.ts';

export const Kabuki = {
  page,
  actor: KabukiLive,
  view: View.lazy(KabukiLive, () => import('./view.tsx')),
};
