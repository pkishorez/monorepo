import { Effect } from 'effect';
import { story, type Attributes } from "laymos/story";

export const attributes: Attributes = {};
export const retained = story('Retained', { description: 'Retained.' });
export const work = () => Effect.void;
