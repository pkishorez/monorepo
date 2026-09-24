import assert from 'node:assert/strict';
import { test } from 'node:test';

import { contentType } from '../src/steps/upload.ts';

test('knows image and video types, rejects others', () => {
  assert.equal(contentType('shots/Home.PNG'), 'image/png');
  assert.equal(contentType('demo.mp4'), 'video/mp4');
  assert.throws(() => contentType('notes.txt'), /Cannot attach notes\.txt/);
});
