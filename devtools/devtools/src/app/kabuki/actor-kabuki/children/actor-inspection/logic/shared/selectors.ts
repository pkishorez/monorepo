import type { DataOf } from '@kestack/kabuki/types';
import type { InspectionShape } from './shape.js';

export const tabOf = ({ props }: DataOf<typeof InspectionShape>) =>
  props?.tab ?? 'inspector';

export const storyShown = (data: DataOf<typeof InspectionShape>) =>
  tabOf(data) === 'story';
