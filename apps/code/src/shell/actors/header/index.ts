import { HeaderLive } from './actor.ts';
import { Offline } from './header.tsx';
import { HeaderModelView, HeaderView } from './view.tsx';

export const Header = {
  actor: HeaderLive,
  view: HeaderView,
  model: HeaderModelView,
  Offline,
};
