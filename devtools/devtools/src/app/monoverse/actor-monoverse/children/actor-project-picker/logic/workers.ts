import { Effect } from 'effect';
import type { WorkersOf } from '@kestack/kabuki/types';

import { Projects } from '../../../../services/projects/contract/index.js';
import { listingOf } from './selectors.js';
import {
  absolute,
  hiddenOf,
  topOf,
  waits,
  type ProjectPickerShape,
} from './shared/index.js';

const DEBOUNCE = '150 millis';

export const workers: WorkersOf<typeof ProjectPickerShape> = {
  recent: {
    each: ({ model }) =>
      model.recent === null && model.recentProblem === null ? ['read'] : [],
    run: (self) =>
      Effect.flatMap(Projects, (service) => service.projects()).pipe(
        Effect.map((projects) => ({
          _tag: 'RecentRead' as const,
          projects,
        })),
        Effect.catch(({ message: problem }) =>
          Effect.succeed({ _tag: 'RecentRefused' as const, problem }),
        ),
        Effect.flatMap((message) => self.send(message)),
      ),
  },
  home: {
    each: ({ model }) => (model.home === null ? ['home'] : []),
    run: (self) =>
      Effect.flatMap(Projects, (projects) =>
        projects.listFolders({ path: null, query: '', hidden: false }),
      ).pipe(
        Effect.flatMap((listing) => self.send({ _tag: 'HomeFound', listing })),
        Effect.ignore,
      ),
  },
  load: {
    each: ({ model }) => {
      const top = topOf(model);
      if (top === null || !waits(top)) return [];
      const query = top.query.trim();
      return [JSON.stringify([top.segments, query, hiddenOf(query)])];
    },
    run: (self, key) =>
      Effect.gen(function* () {
        const [segments, query, hidden] = JSON.parse(key) as [
          ReadonlyArray<string>,
          string,
          boolean,
        ];
        if (query !== '') yield* Effect.sleep(DEBOUNCE);
        const projects = yield* Projects;
        const { model } = yield* self.get;
        const message = yield* Effect.gen(function* () {
          const home =
            segments.length === 0
              ? null
              : (model.home ??
                (yield* projects.listFolders({
                  path: null,
                  query: '',
                  hidden: false,
                })).home);
          const listing = yield* projects.listFolders({
            path: home === null ? null : absolute(home, segments),
            query,
            hidden,
          });
          return {
            _tag: 'Loaded' as const,
            segments,
            listing: listingOf(listing, query, hidden),
            home: listing.home,
          };
        }).pipe(
          Effect.catch(({ message: problem }) =>
            Effect.succeed({
              _tag: 'Loaded' as const,
              segments,
              listing: {
                query,
                hidden,
                path: '',
                kind: null,
                folders: [],
                truncated: false,
                problem,
              },
              home: null,
            }),
          ),
        );
        yield* self.send(message);
      }),
  },
};
