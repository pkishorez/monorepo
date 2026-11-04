import { HeaderLive } from './actor.ts';
import { Notice, Offline } from './header.tsx';
import { HeaderReady, HeaderTitleView, HeaderVoice } from './view.tsx';

export { Voice } from './voice/index.ts';

/** The header: where you are, and Voice. */
export const Header = {
  actor: HeaderLive,
  /** Where you are, for the App Shell's header. */
  title: HeaderTitleView,
  /** Voice, around the screen `Voice.Around` hands it. */
  voice: HeaderVoice,
  /** Draws nothing; says which of its rows are read, for the frame's first draw. */
  ready: HeaderReady,
  /** The pills beside the title while the Connection of the page is out of reach, or behind. */
  Offline,
  Notice,
};
