import { PickersLive } from './actor.ts';
import {
  Around,
  PickersView,
  ProjectButton,
  ProjectNotice,
  SessionActionsButton,
  useRetitling,
} from './view.tsx';

export const Pickers = {
  actor: PickersLive,
  view: PickersView,
  Around,
  /** Where the screen places what the Pickers hand it. */
  ProjectButton,
  ProjectNotice,
  SessionActionsButton,
  /** Whether a Session's title is being written again, for the header. */
  useRetitling,
};
