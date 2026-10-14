import { placeKey } from '../route/index.ts';
import type { Inputs, Place } from '../route/index.ts';

/*
 * What a move needs loaded: the places on its Route that have an Input, less
 * those the entry shown already holds. A place whose key, its name and every
 * param down to it, did not change keeps its Input.
 */

/** The Inputs of `places` that the entry shown holds for the same place. */
export const keep = (
  shown: ReadonlyArray<Place>,
  held: Inputs,
  places: ReadonlyArray<Place>,
): Inputs => {
  const keys = new Set(shown.map(placeKey));
  return Object.fromEntries(
    places.flatMap((place) =>
      place.input && held[place.name] !== undefined && keys.has(placeKey(place))
        ? [[place.name, held[place.name]]]
        : [],
    ),
  );
};

/** The dotted names of the places that need an Input and have none. */
export const wanted = (
  places: ReadonlyArray<Place>,
  inputs: Inputs,
): ReadonlyArray<string> =>
  places
    .filter((place) => place.input && inputs[place.name] === undefined)
    .map((place) => place.name);
