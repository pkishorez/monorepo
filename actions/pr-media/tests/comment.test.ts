import assert from 'node:assert/strict';
import { test } from 'node:test';

import { linkFiles } from '../src/steps/comment.ts';

test('replaces every path, longer paths first', () => {
  const urls = new Map([
    ['a.png', 'https://x/1'],
    ['shots/a.png', 'https://x/2'],
  ]);
  assert.equal(
    linkFiles('![](a.png) ![](shots/a.png) <img src="a.png">', urls),
    '![](https://x/1) ![](https://x/2) <img src="https://x/1">',
  );
});
