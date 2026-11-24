import { Effect } from 'effect';
import type { WorkersOf } from '@kestack/kabuki/types';

import { Monorepo } from '../../services/monorepo/contract/index.js';
import {
  analysisAt,
  changesAt,
  rootOf,
  type MonoverseShape,
  type Place,
} from './shared/index.js';

export const workers: WorkersOf<typeof MonoverseShape> = {
  // 1. List
  projects: {
    run: (self) =>
      Effect.gen(function* () {
        const monorepo = yield* Monorepo;
        const message = yield* monorepo.projects().pipe(
          Effect.map((projects) => ({ _tag: 'Listed' as const, projects })),
          Effect.catch(({ message: problem }) =>
            Effect.succeed({ _tag: 'ListRefused' as const, problem }),
          ),
        );
        yield* self.send(message);
      }),
  },
  // 3. Follow: once for each Place the Props name.
  follow: {
    each: ({ props }) => (props === undefined ? [] : [JSON.stringify(props)]),
    run: (self, place) =>
      self.send({ _tag: 'Followed', place: JSON.parse(place) as Place }),
  },
  // 4. Analyse: while opening, or once the branch named is another than
  // the one analysed.
  analyse: {
    each: ({ model, state }) => {
      const at = analysisAt(model);
      if (state._tag === 'Opening') return [at];
      if (
        (state._tag === 'Monorepo' ||
          state._tag === 'Package' ||
          state._tag === 'Failure') &&
        state.at !== at
      )
        return [at];
      return [];
    },
    run: (self, at) =>
      Effect.gen(function* () {
        const { model, state } = yield* self.get;
        const root = rootOf(state);
        if (root === null) return;
        const monorepo = yield* Monorepo;
        const message = yield* monorepo
          .analyse({ root, branch: model.branch })
          .pipe(
            Effect.map((analysis) => ({
              _tag: 'Analysed' as const,
              at,
              ...analysis,
            })),
            Effect.catch(({ message: problem, reason }) =>
              Effect.succeed({
                _tag: 'AnalyseRefused' as const,
                at,
                problem,
                missing: reason === 'missing',
              }),
            ),
          );
        yield* self.send(message);
      }),
  },
  // 5. Git: the branches, once per project open and reload.
  branches: {
    each: ({ model, state }) => {
      const root = rootOf(state);
      return root === null ? [] : [JSON.stringify([root, model.reloads])];
    },
    run: (self, key) =>
      Effect.gen(function* () {
        const [root] = JSON.parse(key) as [string];
        const monorepo = yield* Monorepo;
        const message = yield* monorepo.branches({ root }).pipe(
          Effect.map((branches) => ({
            _tag: 'BranchesRead' as const,
            branches,
          })),
          Effect.catch(({ message: problem }) =>
            Effect.succeed({ _tag: 'BranchesRefused' as const, problem }),
          ),
        );
        yield* self.send(message);
      }),
  },
  // 5. Git: what the branch changed, while Changes is on.
  changes: {
    each: ({ model, state }) => {
      const at = changesAt(model, state);
      return at === null || model.changed?.at === at ? [] : [at];
    },
    run: (self, at) =>
      Effect.gen(function* () {
        const [root, branch, base] = JSON.parse(at) as [
          string,
          string | null,
          string,
        ];
        const monorepo = yield* Monorepo;
        const message = yield* monorepo.changes({ root, branch, base }).pipe(
          Effect.map(({ files }) => ({
            _tag: 'ChangesRead' as const,
            at,
            files,
          })),
          Effect.catch(({ message: problem }) =>
            Effect.succeed({
              _tag: 'ChangesRefused' as const,
              at,
              problem,
            }),
          ),
        );
        yield* self.send(message);
      }),
  },
};
