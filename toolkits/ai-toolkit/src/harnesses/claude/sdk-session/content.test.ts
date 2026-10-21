import { describe, expect, it } from 'vitest';
import { userContent } from './content.js';

describe('userContent', () => {
  it('is the text alone when there are no images', () => {
    expect(userContent('hi', [])).toBe('hi');
  });

  it('puts each image before the text as a base64 block', () => {
    expect(
      userContent('what color?', [
        { name: 'a.png', mime: 'image/png', data: 'AAAA' },
        { name: 'b.JPG', mime: 'IMAGE/JPEG', data: 'BBBB' },
      ]),
    ).toEqual([
      {
        type: 'image',
        source: { type: 'base64', media_type: 'image/png', data: 'AAAA' },
      },
      {
        type: 'image',
        source: { type: 'base64', media_type: 'image/jpeg', data: 'BBBB' },
      },
      { type: 'text', text: 'what color?' },
    ]);
  });

  it('leaves out a file the API cannot read as an image', () => {
    expect(
      userContent('hi', [{ name: 'a.svg', mime: 'image/svg+xml', data: 'x' }]),
    ).toBe('hi');
  });
});
