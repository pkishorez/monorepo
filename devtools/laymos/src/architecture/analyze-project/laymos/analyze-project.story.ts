import { strict as assert } from 'node:assert';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { Effect } from 'effect';

import { story } from '../../../stories/authoring/index.js';
import { analyzeProject } from '../index.js';

const projectDir = resolve(import.meta.dirname, '../../../..');

interface PreparedProject {
  readonly projectDir: string;
  readonly temporary: boolean;
}

story('Analyze a project', {
  description:
    'Follows configuration loading, source extraction, ownership resolution, rule validation, and report construction for one project.',
})
  .execute(({ projectDir }: PreparedProject) => analyzeProject({ projectDir }))
  .scenario(
    'valid Laymos project',
    {
      description:
        'Completes the full static journey and returns architecture problems as report data rather than operation failures.',
    },
    (scenario) =>
      scenario
        .prepare(() => Effect.succeed({ projectDir, temporary: false }))
        .verify((report) =>
          Effect.sync(() => {
            assert.equal(report.violations.length, 0);
            assert.ok(Object.keys(report.files).length > 0);
            assert.ok(
              Object.values(report.architecture.modules).every(
                ({ documentation }) => documentation !== undefined,
              ),
            );
          }),
        )
        .cleanup(cleanupProject),
  )
  .scenario(
    'configuration file is missing',
    {
      description:
        'Stops at configuration lookup with ConfigNotFoundError before any source discovery begins.',
    },
    (scenario) =>
      scenario
        .prepare(() =>
          Effect.succeed({
            projectDir: resolve(projectDir, 'missing-project'),
            temporary: false,
          }),
        )
        .verifyError((error) =>
          Effect.sync(() => {
            assert.equal(error._tag, 'ConfigNotFoundError');
          }),
        )
        .cleanup(cleanupProject),
  )
  .scenario(
    'configuration module cannot be imported',
    {
      description:
        'Returns ConfigImportError when jiti cannot execute the authored TypeScript module.',
    },
    (scenario) =>
      scenario
        .prepare(() => temporaryProject('export default {\n'))
        .verifyError((error) =>
          Effect.sync(() => {
            assert.equal(error._tag, 'ConfigImportError');
          }),
        )
        .cleanup(cleanupProject),
  )
  .scenario(
    'default export has the wrong shape',
    {
      description:
        'Returns ConfigValidationError before semantic checks when the default export is not recognizable as Laymos configuration.',
    },
    (scenario) =>
      scenario
        .prepare(() => temporaryProject('export default { nope: true };'))
        .verifyError((error) =>
          Effect.sync(() => {
            assert.equal(error._tag, 'ConfigValidationError');
            assert.deepEqual(error.issues, [
              'Config must default-export a value created with defineConfig()',
            ]);
          }),
        )
        .cleanup(cleanupProject),
  )
  .scenario(
    'configuration has semantic issues',
    {
      description:
        'Collects all semantic issues after recognizing the configuration data shape.',
    },
    (scenario) =>
      scenario
        .prepare(() =>
          temporaryProject('export default { sourceRoots: [], graphs: [] };'),
        )
        .verifyError((error) =>
          Effect.sync(() => {
            assert.equal(error._tag, 'ConfigValidationError');
            assert.ok(error.issues.length > 0);
          }),
        )
        .cleanup(cleanupProject),
  );

function temporaryProject(
  configSource: string,
): Effect.Effect<PreparedProject, Error> {
  return Effect.tryPromise({
    try: async () => {
      const directory = await mkdtemp(join(tmpdir(), 'laymos-story-'));
      await writeFile(join(directory, 'laymos.config.ts'), configSource);
      return { projectDir: directory, temporary: true };
    },
    catch: (cause) =>
      cause instanceof Error ? cause : new Error(String(cause)),
  });
}

function cleanupProject({
  projectDir,
  temporary,
}: PreparedProject): Effect.Effect<void, Error> {
  return temporary
    ? Effect.tryPromise({
        try: () => rm(projectDir, { recursive: true, force: true }),
        catch: (cause) =>
          cause instanceof Error ? cause : new Error(String(cause)),
      })
    : Effect.void;
}
