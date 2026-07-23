import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { test } from '../../../tests/authoring/index.js';

import { transformStorySource } from '../index.js';

const fixtureRoot = join(
  import.meta.dirname,
  '../../../../test/fixtures/story-ejection',
);
const beforeDirectory = join(fixtureRoot, 'before');
const afterDirectory = join(fixtureRoot, 'after');

test('Transform Story source during ejection', {
  description:
    'Checks every supported Story instrumentation transform and its idempotent production output.',
})
  .execute((source: string, fileName: string) => {
    const transformed = transformStorySource(source, fileName);
    const repeated = transformStorySource(transformed, fileName);
    return repeated === transformed ? transformed : 'EJECTION_NOT_IDEMPOTENT';
  })
  .cases(
    readdirSync(beforeDirectory)
      .sort()
      .map((fileName) => ({
        kind: 'positive' as const,
        name: fixtureCaseName(fileName),
        description: `Transforms ${fileName} into its expected production source.`,
        inputs: [
          readFileSync(join(beforeDirectory, fileName), 'utf8'),
          fileName,
        ] as const,
        expected: readFileSync(join(afterDirectory, fileName), 'utf8'),
      })),
  );

function fixtureCaseName(fileName: string): string {
  const words = fileName
    .replace(/\.[^.]+$/, '')
    .replace(/^\d+-/, '')
    .replaceAll('-', ' ');
  return `${words.charAt(0).toUpperCase()}${words.slice(1)}`;
}
