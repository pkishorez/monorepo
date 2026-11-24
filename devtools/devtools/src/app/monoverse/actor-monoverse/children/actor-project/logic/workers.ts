import { Effect } from 'effect';
import type { WorkersOf } from '@kestack/kabuki/types';

import { Projects } from '../../../../services/projects/contract/index.js';
import { analysisAt, changesAt, type ProjectShape } from './shared/index.js';

export const workers: WorkersOf<typeof ProjectShape> = {
  // 1. Analyse: while opening, or once the branch named is another than
  // the one analysed.
  analyse: {
    each: (data) => {
      const { state } = data;
      const at = analysisAt(data);
      if (state._tag === 'Opening') return [at];
      if (state.at !== at) return [at];
      return [];
    },
    run: (self, at) =>
      Effect.gen(function* () {
        const { model, props } = yield* self.get;
        const projects = yield* Projects;
        const message = yield* projects
          .analyse({ root: model.root, branch: props.branch })
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
  // 2. Git: the branches, once per reload.
  branches: {
    each: ({ model }) => [JSON.stringify([model.root, model.reloads])],
    run: (self, key) =>
      Effect.gen(function* () {
        const [root] = JSON.parse(key) as [string];
        const projects = yield* Projects;
        const message = yield* projects.branches({ root }).pipe(
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
  // 2. Git: what the branch changed, while Changes is on.
  changes: {
    each: (data) => {
      const at = changesAt(data);
      return at === null || data.model.changed?.at === at ? [] : [at];
    },
    run: (self, at) =>
      Effect.gen(function* () {
        const [root, branch, base] = JSON.parse(at) as [
          string,
          string | null,
          string,
        ];
        const projects = yield* Projects;
        const message = yield* projects.changes({ root, branch, base }).pipe(
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
  // 4. View: once for each Package the Props name.
  follow: {
    each: ({ props }) => [JSON.stringify(props.package)],
    run: (self, key) =>
      self.send({
        _tag: 'Followed',
        package: JSON.parse(key) as string | null,
      }),
  },
};
