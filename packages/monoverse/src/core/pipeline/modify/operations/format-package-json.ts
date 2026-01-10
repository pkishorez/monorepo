import { Effect } from 'effect';
import type { Workspace } from '../../analyze/types.js';
import { joinPath, readFile } from '../../../primitives/fs/index.js';
import { writePackageJson } from '../package-json.js';
import { ModifyError } from '../types.js';

export const formatPackageJson = (
  workspace: Workspace,
): Effect.Effect<void, ModifyError> =>
  Effect.gen(function* () {
    const filePath = joinPath(workspace.path, 'package.json');

    const content = yield* readFile(filePath).pipe(
      Effect.mapError(
        (cause) =>
          new ModifyError({
            workspace: workspace.name,
            message: 'Failed to read package.json',
            cause,
          }),
      ),
    );

    yield* writePackageJson(workspace, content).pipe(
      Effect.mapError(
        (cause) =>
          new ModifyError({
            workspace: workspace.name,
            message: 'Failed to write package.json',
            cause,
          }),
      ),
    );
  });
