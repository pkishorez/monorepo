import { Effect } from 'effect';

import {
  analyzeProject as analyzeProjectOperation,
  type AnalyzeProjectRequest,
} from '../../architecture/analyze-project/index.js';
import type { LaymosError } from '../../architecture/errors.js';
import { loadConfig } from '../../config/load-config/index.js';
import {
  serializeProjectNarrative,
  type ProjectNarrative,
} from '../../config/project-narrative.js';
import type { LaymosReport } from '../../report/index.js';
import type { TestsReport } from '../../report/tests.js';
import {
  executeTests,
  type TestRunInProgress,
  type TestRunnerError,
  type TestsRunOptions,
} from '../../tests/run-tests/index.js';

export {
  ConfigImportError,
  ConfigNotFoundError,
  ConfigValidationError,
} from '../../config/load-config/index.js';
export { ExtractError } from '../../architecture/errors.js';
export {
  TestRunInProgress,
  TestRunnerError,
} from '../../tests/run-tests/index.js';
export type { TestsRunOptions } from '../../tests/run-tests/index.js';

export interface GetProjectNarrativeRequest {
  readonly projectDir: string;
}

export interface RunTestsRequest extends TestsRunOptions {
  readonly projectDir: string;
}

/** Runs the project's ordinary Vitest suite and returns a serializable report. */
export function runTests(
  request: RunTestsRequest,
): Effect.Effect<TestsReport, TestRunInProgress | TestRunnerError> {
  return executeTests(request.projectDir, {
    ...(request.files === undefined ? {} : { files: request.files }),
    ...(request.testNamePattern === undefined
      ? {}
      : { testNamePattern: request.testNamePattern }),
  });
}

/** Analyzes one project's declared and actual static architecture. */
export function analyzeProject(
  request: AnalyzeProjectRequest,
): Effect.Effect<LaymosReport, LaymosError> {
  return analyzeProjectOperation(request);
}

/** Loads the project narrative without waiting for project analysis. */
export function getProjectNarrative({
  projectDir,
}: GetProjectNarrativeRequest): Effect.Effect<
  ProjectNarrative | undefined,
  import('../../config/load-config/index.js').LoadConfigError
> {
  return loadConfig({ projectDir }).pipe(
    Effect.map((config) =>
      config.project === undefined
        ? undefined
        : serializeProjectNarrative(config.project),
    ),
  );
}
