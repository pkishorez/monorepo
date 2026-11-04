import { Picking, ChooseLive } from './actor.ts';
import { Around, ChooseView, usePlaced } from './view.tsx';

export { Chip, ModelPicker, Triggers } from './model/index.ts';
export { BranchPicker, BranchSettings } from './branch/index.ts';
export { SkillPicker } from './skills.ts';
export {
  current,
  NOBODY,
  pickedBranch,
  pickedHarness,
  pickedModel,
  pickedSettings,
  firstStep,
  skillsOf,
} from './choose.ts';

/** The Draft's Pickers: its Actor, its View, and where the Draft places each. */
export const Choose = {
  actor: ChooseLive,
  view: ChooseView,
  Around,
  usePlaced,
  Picking,
};
