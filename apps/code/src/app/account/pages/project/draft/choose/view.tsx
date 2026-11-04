import { View } from '@kestack/kabuki/react';
import { createContext, use, type ReactNode } from 'react';
import { BranchPicker } from './branch/index.ts';
import { ModelPicker } from './model/index.ts';
import { SkillPicker } from './skills.ts';
import { ChooseLive } from './actor.ts';

/*
 * The Pickers' View, around the Draft: the Picker open, if one is, for
 * the Draft to place where it opens, beside the button or the key that
 * opened it.
 */

/** What the Pickers are drawn around: the Draft, from its View. */
export const Around = createContext<ReactNode>(null);

const Placed = createContext<{
  readonly skills: ReactNode;
  readonly models: ReactNode;
  readonly branches: ReactNode;
}>({ skills: null, models: null, branches: null });

export const ChooseView = View.make(ChooseLive, ({ children }) => (
  <Placed
    value={{
      skills: children.skills && (
        <SkillPicker.View instance={children.skills} />
      ),
      models: children.models && (
        <ModelPicker.View instance={children.models} />
      ),
      branches: children.branches && (
        <BranchPicker.View instance={children.branches} />
      ),
    }}
  >
    {use(Around)}
  </Placed>
));

/** The Picker open, where the Draft places it: null for each not open. */
export const usePlaced = () => use(Placed);
