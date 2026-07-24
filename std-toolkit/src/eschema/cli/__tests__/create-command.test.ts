import {
  existsSync,
  mkdtempSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { NodeServices } from '@effect/platform-node';
import { Console, Effect } from 'effect';
import { Command } from 'effect/unstable/cli';
import { describe, expect, it } from 'vitest';
import { createCommand } from '../create/index.js';
import { renderLintReport } from '../lint/index.js';
import { analyzeSnapshots } from '../shared/schema-snapshots/index.js';

const quietConsole = { ...console, log() {} } satisfies Console.Console;

function makeRoot() {
  return mkdtempSync(join(tmpdir(), 'eschema-create-'));
}

async function runCreate(root: string, schemaPath: string) {
  await Command.runWith(createCommand, { version: '0.0.1' })([
    '--root',
    root,
    schemaPath,
  ]).pipe(
    Effect.provide(NodeServices.layer),
    Effect.provideService(Console.Console, quietConsole),
    Effect.runPromise,
  );
}

async function analyze(root: string) {
  return analyzeSnapshots(root).pipe(
    Effect.provide(NodeServices.layer),
    Effect.runPromise,
  );
}

function readText(path: string) {
  return readFileSync(path, 'utf8');
}

describe('ESchema', () => {
  describe('CLI', () => {
    describe('Create', () => {
      it('creates a flat plain ESchema scaffold', async () => {
        const root = makeRoot();

        await runCreate(root, 'user-profile');

        const schemaRoot = join(root, 'user-profile');
        expect(readText(join(schemaRoot, 'schema.ts'))).toBe(
          "import { v1 } from './versions/v1.js';\n\nexport const schema = v1.build();\n",
        );
        expect(readText(join(schemaRoot, 'versions', 'v1.ts'))).toBe(
          "import { Schema } from 'effect';\nimport { ESchema } from 'std-toolkit/eschema';\n\nexport const v1 = ESchema.make({\n  name: Schema.String,\n});\n",
        );
        expect(readText(join(schemaRoot, 'index.ts'))).toBe(
          "import type { ESchemaType } from 'std-toolkit/eschema';\nimport { schema } from './schema.js';\n\nexport { schema as userProfileSchema };\n\nexport type UserProfile = ESchemaType<typeof schema>;\n",
        );
        expect(existsSync(join(schemaRoot, 'snapshots.json'))).toBe(false);
        expect(existsSync(join(schemaRoot, '__snapshots__'))).toBe(false);
      });

      it('creates a nested plain ESchema scaffold', async () => {
        const root = makeRoot();

        await runCreate(root, 'identity/user-profile');

        const schemaRoot = join(root, 'identity', 'user-profile');
        expect(readText(join(schemaRoot, 'schema.ts'))).toBe(
          "import { v1 } from './versions/v1.js';\n\nexport const schema = v1.build();\n",
        );
        expect(readText(join(schemaRoot, 'versions', 'v1.ts'))).toContain(
          'export const v1 = ESchema.make',
        );
        expect(readText(join(schemaRoot, 'index.ts'))).toContain(
          'export { schema as userProfileSchema };',
        );
      });

      it('derives the schema export and type name from the final path segment', async () => {
        const root = makeRoot();

        await runCreate(root, 'identity/account-settings');

        expect(
          readText(join(root, 'identity', 'account-settings', 'index.ts')),
        ).toBe(
          "import type { ESchemaType } from 'std-toolkit/eschema';\nimport { schema } from './schema.js';\n\nexport { schema as accountSettingsSchema };\n\nexport type AccountSettings = ESchemaType<typeof schema>;\n",
        );
      });

      it('fails without modifying files when the target directory is non-empty', async () => {
        const root = makeRoot();
        const schemaRoot = join(root, 'user-profile');
        const existingFile = join(schemaRoot, 'schema.ts');
        mkdirSync(schemaRoot, { recursive: true });
        writeFileSync(existingFile, 'user content\n');

        await expect(runCreate(root, 'user-profile')).rejects.toThrow(
          'Schema path already exists and is not empty',
        );
        expect(readText(existingFile)).toBe('user content\n');
      });

      it.each([
        '/absolute',
        'identity/../user-profile',
        'identity//user-profile',
      ])('rejects invalid schema path %s', async (schemaPath) => {
        const root = makeRoot();

        await expect(runCreate(root, schemaPath)).rejects.toThrow();
        expect(readdirSync(root)).toEqual([]);
      });

      it('reports the scaffolded v1 as new and unapproved during lint', async () => {
        const root = makeRoot();
        await runCreate(root, 'user-profile');

        const output = renderLintReport(await analyze(root));

        expect(output.exitCode).toBe(1);
        expect(output.text).toContain('Schema: user-profile');
        expect(output.text).toContain('Latest: v1');
        expect(output.text).toContain('v1 new');
        expect(output.text).toContain(
          'NewVersion v1: Version v1 is not in snapshots.json',
        );
      });
    });
  });
});
