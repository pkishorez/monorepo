import { join } from 'node:path';
import { Effect, FileSystem } from 'effect';
import { toCamelCase, toPascalCase } from './schema-path.js';

export function writeGeneratedSchemaFiles(input: {
  readonly schemaRoot: string;
  readonly finalSegment: string;
}): Effect.Effect<void, unknown, FileSystem.FileSystem> {
  return Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const valueName = toPascalCase(input.finalSegment);
    const schemaExportName = `${toCamelCase(input.finalSegment)}Schema`;

    yield* fs.makeDirectory(join(input.schemaRoot, 'versions'), {
      recursive: true,
    });
    yield* fs.writeFileString(
      join(input.schemaRoot, 'schema.ts'),
      schemaFileContent,
    );
    yield* fs.writeFileString(
      join(input.schemaRoot, 'versions', 'v1.ts'),
      versionFileContent,
    );
    yield* fs.writeFileString(
      join(input.schemaRoot, 'index.ts'),
      indexFileContent(schemaExportName, valueName),
    );
  });
}

const schemaFileContent =
  "import { v1 } from './versions/v1.js';\n\nexport const schema = v1.build();\n";

const versionFileContent =
  "import { Schema } from 'effect';\nimport { ESchema } from '@std-toolkit/eschema';\n\nexport const v1 = ESchema.make({\n  name: Schema.String,\n});\n";

function indexFileContent(schemaExportName: string, valueName: string) {
  return `import type { ESchemaType } from '@std-toolkit/eschema';
import { schema } from './schema.js';

export { schema as ${schemaExportName} };

export type ${valueName} = ESchemaType<typeof schema>;
`;
}
