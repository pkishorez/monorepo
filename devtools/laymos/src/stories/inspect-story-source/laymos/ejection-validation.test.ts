import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { test } from '../../../tests/authoring/index.js';

import { transformStorySource } from '../index.js';

const fixtureDirectory = join(
  import.meta.dirname,
  '../../../../test/fixtures/story-ejection/invalid',
);

test('Reject invalid Story ejection source', {
  description:
    'Checks that every unsupported Story authoring shape is rejected with its expected diagnostic.',
})
  .execute((source: string, fileName: string) => {
    try {
      transformStorySource(source, fileName);
      return 'accepted';
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause);
      return message.startsWith(`${fileName}:`)
        ? message.slice(fileName.length + 1).replace(/^\d+:\d+: /, '')
        : message;
    }
  })
  .cases(
    readdirSync(fixtureDirectory)
      .filter((name) => name.endsWith('.ts'))
      .sort()
      .map((fileName) => ({
        kind: 'negative' as const,
        name: fixtureCaseName(fileName),
        description: `Rejects the unsupported Story authoring shape in ${fileName}.`,
        inputs: [
          readFileSync(join(fixtureDirectory, fileName), 'utf8'),
          fileName,
        ] as const,
        expected: readFileSync(
          join(fixtureDirectory, fileName.replace(/\.ts$/, '.error.txt')),
          'utf8',
        ).trim(),
      })),
  );

function fixtureCaseName(fileName: string): string {
  const words = fileName.replace(/\.[^.]+$/, '').replaceAll('-', ' ');
  return `${words.charAt(0).toUpperCase()}${words.slice(1)}`;
}
