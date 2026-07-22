import { describe, expect, it } from 'vitest';

import { viewportWithPreservedAnchor } from './viewport';

describe('viewportWithPreservedAnchor', () => {
  it('compensates for a laid-out node moving on screen', () => {
    expect(
      viewportWithPreservedAnchor(
        { x: 40, y: -20, zoom: 0.75 },
        { x: 300, y: 240 },
        { x: 250, y: 310 },
      ),
    ).toEqual({ x: 90, y: -90, zoom: 0.75 });
  });
});
