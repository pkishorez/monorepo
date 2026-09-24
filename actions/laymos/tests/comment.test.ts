import assert from 'node:assert/strict';
import { test } from 'node:test';

import { buildComment } from '../src/comment.ts';

const image = (theme: 'dark' | 'light') => ({
  theme,
  out: `/tmp/app-${theme}.png`,
  width: 512,
  height: 300,
});

test('shows one picture per drawn Project that follows the theme', () => {
  const { markdown, create, files } = buildComment(
    [
      {
        project: 'apps/app',
        title: 'apps/app',
        modules: 9,
        changedModules: 2,
        images: [image('dark'), image('light')],
      },
    ],
    'origin/main',
  );
  assert.equal(create, true);
  assert.deepEqual(files, ['/tmp/app-dark.png', '/tmp/app-light.png']);
  assert.match(markdown, /### `apps\/app`\n\n2 of 9 Modules changed/);
  assert.match(
    markdown,
    /<picture><source media="\(prefers-color-scheme: dark\)" srcset="\/tmp\/app-dark.png"><img alt="apps\/app" src="\/tmp\/app-light.png" width="512"><\/picture>/,
  );
});

test('uses a plain image when one theme was drawn', () => {
  const { markdown } = buildComment(
    [
      {
        project: '.',
        title: 'repo',
        modules: 1,
        changedModules: 1,
        images: [image('dark')],
      },
    ],
    'origin/main',
  );
  assert.match(markdown, /\n<img alt="repo" src="\/tmp\/app-dark.png"/);
  assert.doesNotMatch(markdown, /<picture>/);
});

test('names failed Projects and says when nothing changed', () => {
  const failed = buildComment(
    [{ project: 'apps/app', error: 'No config\nstack' }],
    'origin/main',
  );
  assert.equal(failed.create, true);
  assert.match(failed.markdown, /No Module changed since `origin\/main`\./);
  assert.match(
    failed.markdown,
    /> \[!WARNING\]\n> `apps\/app` could not be drawn: No config$/,
  );
  assert.equal(buildComment([], 'origin/main').create, false);
});
