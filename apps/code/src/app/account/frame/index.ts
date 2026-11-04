import { FrameLive, keyboard, Keys, keysOf } from './actor.ts';
import { FrameView, Given } from './view.tsx';

/** What is drawn around every page: its Actor, its View, and its keyboard. */
export const Frame = {
  actor: FrameLive,
  view: FrameView,
  Given,
  Keys,
  keysOf,
  keyboard,
};
