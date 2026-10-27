import { View } from '@kestack/kabuki/react';
import { Settings as page, SettingsLive } from './actor.ts';

export const Settings = {
  page,
  actor: SettingsLive,
  view: View.lazy(SettingsLive, () => import('./view.tsx')),
};
