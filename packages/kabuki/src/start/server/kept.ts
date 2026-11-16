import { Effect } from 'effect';
import type { Outcome } from '../../routing/route/index.ts';
import { dataPath, loadable, readLine } from '../app/protocol/index.ts';
import type { RoutesOnWire, Wanted } from '../app/protocol/index.ts';
import type { Host } from '../platform/index.ts';

/*
 * A static place's answer, read as the build kept it rather than loaded:
 * its Loader ran once, at the build, so the page drawn then and the data
 * a move loads later cannot disagree, and a path the build did not list
 * has no file, so its place is not found.
 */

/** Reads the kept answer of each static place asked for from the build's Static Data, by the platform's files. */
export const keptOf = (routes: RoutesOnWire, data: string) => {
  const places = loadable(routes);
  return (files: NonNullable<Host['files']>) =>
    (wanted: Wanted): Effect.Effect<readonly [string, Outcome]> =>
      Effect.promise(async (): Promise<readonly [string, Outcome]> => {
        const { name, params } = wanted;
        try {
          const file = await files(
            `${data}${dataPath(places.get(name)!, params)}`,
          );
          if (!file) return [name, { _tag: 'NotFound' }];
          const line = { name, outcome: (await file.json()) as Outcome };
          return [name, readLine(routes, places, line).outcome];
        } catch (error) {
          return [
            name,
            {
              _tag: 'Broken',
              reason: error instanceof Error ? error.message : String(error),
            },
          ];
        }
      });
};
