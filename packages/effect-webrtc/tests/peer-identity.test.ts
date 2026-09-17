import { describe, expect, it } from 'vitest';
import { generatePeerId } from '../src/peer-identity/index.js';

describe('generatePeerId', () => {
  it('returns distinct UUID peer identifiers', () => {
    const first = generatePeerId();
    const second = generatePeerId();

    expect(first).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
    expect(second).not.toBe(first);
  });
});
