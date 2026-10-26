import { LayoutLive, keyboard, Keys, keysOf } from './actor.ts';
import { LayoutView, Given } from './view.tsx';

/** What is drawn around every page: its Actor, its View, and its keyboard. */
export const Layout = {
  actor: LayoutLive,
  view: LayoutView,
  Given,
  Keys,
  keysOf,
  keyboard,
};
