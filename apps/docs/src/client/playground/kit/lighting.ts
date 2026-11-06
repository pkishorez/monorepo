import { lighting } from '@kestack/dune';
import { useParams, type Group } from './params.tsx';
import { STAGE_HEX } from './theme.ts';

/*
 * Lighting's fourteen params, in three groups a person can find their way
 * through: the light itself, the shape it falls on, and the finish of
 * that shape. Only the light is open at first.
 */
const GROUPS: ReadonlyArray<Group> = [
  {
    title: 'Light',
    keys: ['intensity', 'ambient', 'reach', 'lift', 'light'],
    open: true,
  },
  { title: 'Surface', keys: ['raise', 'bevel', 'depth', 'emboss'] },
  { title: 'Finish', keys: ['gloss', 'shininess', 'shadow', 'haze', 'floor'] },
];

/** Lighting's params as state, with the playground's floor. */
export const useLighting = () =>
  useParams(lighting, { initial: { floor: STAGE_HEX }, groups: GROUPS });
