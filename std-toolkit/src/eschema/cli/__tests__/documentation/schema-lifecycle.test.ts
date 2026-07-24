import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { NodeServices } from '@effect/platform-node';
import { Console, Effect } from 'effect';
import { Command } from 'effect/unstable/cli';
import { laymosDescribe, laymosTest } from 'laymos/test';
import { describe } from 'vitest';

import { approveVersionSnapshot } from '../../approve/index.js';
import { createCommand } from '../../create/index.js';
import { renderLintReport } from '../../lint/index.js';
import {
  analyzeSnapshots,
  hashSnapshotContent,
} from '../../shared/schema-snapshots/index.js';
import { copySchemaSnapshotFixture } from '../schema-snapshot-fixtures.js';

const quietConsole = { ...console, log() {} } satisfies Console.Console;

const temporaryRoot = () =>
  mkdtempSync(join(tmpdir(), 'eschema-laymos-documentation-'));

const readText = (path: string) => readFileSync(path, 'utf8');

const provideNode = <A, E, R>(
  effect: Effect.Effect<A, E, R>,
): Effect.Effect<A, E, Exclude<R, NodeServices.NodeServices>> =>
  effect.pipe(Effect.provide(NodeServices.layer)) as Effect.Effect<
    A,
    E,
    Exclude<R, NodeServices.NodeServices>
  >;

describe('ESchema', () => {
  describe('CLI', () => {
    laymosDescribe(
      'Schema lifecycle',
      {
        description:
          'The ESchema CLI creates a version history, checks it against approved snapshots, and explicitly approves intentional changes.',
        documentation: `
ESchema migrations can read old data only while the historical schemas keep
their original meaning. The CLI protects that promise as a small lifecycle.

\`eschema create\` starts a kebab-case schema root with a v1 builder, a public
barrel, and no approval files. \`eschema lint\` renders every discovered schema,
compares version sources with their approved snapshots and hashes, and fails
when history is new, modified, missing, or structurally invalid. \`eschema
approve\` records an intentional version source as the immutable reference
future lint runs will protect.

\`\`\`sh
eschema create --root src/schemas identity/user-profile
eschema lint --root src/schemas
eschema approve --root src/schemas
\`\`\`

Creation refuses to write into a non-empty target or escape the declared root.
Lint reports all issues rather than stopping at the first. Approval never edits
the version source; it copies that source into \`__snapshots__\` and records its
content hash. Modified non-latest history is blocked unless the caller
explicitly uses the force escape hatch.
        `,
      },
      () => {
        laymosTest(
          'Creates a new v1 schema root from a kebab-case domain path.',
          {
            description:
              'The schema collection is empty. Creating identity/user-profile should produce a nested root, a v1 ESchema builder, and public names derived from the final path segment.',
          },
          ({ expect, trace }) =>
            Effect.gen(function* () {
              const root = temporaryRoot();

              yield* trace(
                Command.runWith(createCommand, { version: '0.0.1' })([
                  '--root',
                  root,
                  'identity/user-profile',
                ]).pipe(
                  Effect.provide(NodeServices.layer),
                  Effect.provideService(Console.Console, quietConsole),
                ),
              );

              const schemaRoot = join(root, 'identity', 'user-profile');
              expect(
                readText(join(schemaRoot, 'versions', 'v1.ts')),
                'The first version is an editable ESchema v1 builder.',
              ).toContain('export const v1 = ESchema.make');
              expect(
                readText(join(schemaRoot, 'index.ts')),
                'The public barrel derives camel-case schema and Pascal-case type names from the kebab-case path.',
              ).toContain('export { schema as userProfileSchema };');
              expect(
                existsSync(join(schemaRoot, 'snapshots.json')),
                'A fresh schema remains unapproved until the caller reviews it.',
              ).toBe(false);
            }),
        );

        laymosTest(
          'Refuses to replace files in a non-empty schema root.',
          {
            description:
              'The target already contains user-authored schema.ts. Create must fail before writing anything so an accidental repeated command cannot destroy a schema history.',
          },
          ({ expect, trace }) =>
            Effect.gen(function* () {
              const root = temporaryRoot();
              const schemaRoot = join(root, 'user-profile');
              const existingFile = join(schemaRoot, 'schema.ts');
              mkdirSync(schemaRoot, { recursive: true });
              writeFileSync(existingFile, 'user-authored content\n');

              const failure = yield* trace(
                Command.runWith(createCommand, { version: '0.0.1' })([
                  '--root',
                  root,
                  'user-profile',
                ]).pipe(
                  Effect.provide(NodeServices.layer),
                  Effect.provideService(Console.Console, quietConsole),
                  Effect.flip,
                ),
              );

              expect(
                failure instanceof Error,
                'A non-empty target reports a command failure.',
              ).toBe(true);
              expect(
                readText(existingFile),
                'The existing schema file is byte-for-byte unchanged.',
              ).toBe('user-authored content\n');
            }),
        );

        laymosTest(
          'Reports a clean approved history as safe.',
          {
            description:
              'Both versions in the fixture have matching snapshots and manifest hashes. Lint should describe them as approved and return a successful exit decision.',
          },
          ({ expect, trace }) =>
            Effect.gen(function* () {
              const root = copySchemaSnapshotFixture(
                'clean',
                'eschema-laymos-lint-',
              );

              const output = yield* trace(
                provideNode(analyzeSnapshots(root)).pipe(
                  Effect.map(renderLintReport),
                ),
              );

              expect(
                output.exitCode,
                'A fully approved schema history passes lint.',
              ).toBe(0);
              expect(
                output.text,
                'The lint report explains that both historical versions are approved.',
              ).toContain('v1 approved');
              expect(
                output.text,
                'The lint report includes the current approved version.',
              ).toContain('v2 approved');
            }),
        );

        laymosTest(
          'Shows the exact source change when approved history is modified.',
          {
            description:
              'The current v2 source no longer matches its approved snapshot. Lint should fail and include a unified diff so the caller can review the semantic change before approval.',
          },
          ({ expect, trace }) =>
            Effect.gen(function* () {
              const root = copySchemaSnapshotFixture(
                'modified',
                'eschema-laymos-lint-',
              );

              const output = yield* trace(
                provideNode(analyzeSnapshots(root)).pipe(
                  Effect.map(renderLintReport),
                ),
              );

              expect(
                output.exitCode,
                'Modified approved history fails lint.',
              ).toBe(1);
              expect(
                output.text,
                'The report identifies the modified version and shows its snapshot-to-source diff.',
              ).toContain('ModifiedVersion v2');
              expect(
                output.text,
                'The report marks the approved snapshot as the old side of the diff.',
              ).toContain('--- user/__snapshots__/v2.ts.snap');
              expect(
                output.text,
                'The report marks the live version source as the new side of the diff.',
              ).toContain('+++ user/versions/v2.ts');
            }),
        );

        laymosTest(
          'Approves a new version without changing its source.',
          {
            description:
              'The new v1 source has been reviewed. Approval should copy it exactly into the snapshot directory, hash that content in the manifest, and leave the author’s version file untouched.',
          },
          ({ expect, trace }) =>
            Effect.gen(function* () {
              const root = copySchemaSnapshotFixture(
                'new-version',
                'eschema-laymos-approve-',
              );
              const schemaRoot = join(root, 'user');
              const versionSource = readText(
                join(schemaRoot, 'versions', 'v1.ts'),
              );

              yield* trace(
                provideNode(
                  approveVersionSnapshot({ schemaRoot, version: 'v1' }),
                ),
              );

              expect(
                readText(join(schemaRoot, '__snapshots__', 'v1.ts.snap')),
                'Approval records an exact snapshot of the reviewed version source.',
              ).toBe(versionSource);
              expect(
                JSON.parse(readText(join(schemaRoot, 'snapshots.json'))).v1,
                'The approval manifest records the hash of the reviewed source.',
              ).toBe(hashSnapshotContent(versionSource));
              expect(
                readText(join(schemaRoot, 'versions', 'v1.ts')),
                'Approval never rewrites the version source itself.',
              ).toBe(versionSource);
            }),
        );
      },
    );
  });
});
