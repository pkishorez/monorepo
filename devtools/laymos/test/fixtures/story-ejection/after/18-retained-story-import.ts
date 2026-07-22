import { Effect } from 'effect';
import { storyGroup, type Attributes } from "laymos/story";

export const attributes: Attributes = {};
export const group = storyGroup('Group', { description: 'A group.' });
export const work = () => Effect.void;
