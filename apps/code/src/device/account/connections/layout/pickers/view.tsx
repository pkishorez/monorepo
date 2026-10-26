import { View } from '@kestack/kabuki/react';
import { createContext, use, type ReactNode } from 'react';
import { Actions } from './actions/index.ts';
import { Projects } from './projects/index.ts';
import { Sessions } from './sessions/index.ts';
import { PickersLive } from './actor.ts';

/*
 * The Pickers' View, around the screen: the Project Picker's button and
 * its notice, and the Actions' button, for the screen to place; the
 * Session Switcher, and each Picker opened by keys, drawn beside it.
 */

/** What the Pickers are drawn around: the screen, from Layout. */
export const Around = createContext<ReactNode>(null);

const Placed = createContext<{
  readonly project: ReactNode;
  readonly notice: ReactNode;
  readonly actions: ReactNode;
}>({ project: null, notice: null, actions: null });

export const PickersView = View.make(PickersLive, ({ children }) => (
  <Placed
    value={{
      project: <Projects.button instance={children.projects} />,
      notice: <Projects.notice instance={children.projects} />,
      actions: <Actions.view instance={children.actions} />,
    }}
  >
    {use(Around)}
    <Sessions.view instance={children.sessions} />
    <Projects.view instance={children.projects} />
  </Placed>
));

/** The Project Picker's button, where the screen places it. */
export function ProjectButton() {
  return use(Placed).project;
}

/** Why the folder just made has no git repository, where the screen places it. */
export function ProjectNotice() {
  return use(Placed).notice;
}

/** The Actions' button, where the header places it. */
export function SessionActionsButton() {
  return use(Placed).actions;
}
