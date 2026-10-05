import { describe, expect, it } from 'vitest';
import { splashHead, splashScreens } from '../index.ts';

describe('splash', () => {
  it('gives every iOS screen its own image', () => {
    const media = splashHead().links.map((link) => link.media);
    expect(new Set(media).size).toBe(media.length);
    const hrefs = splashScreens.map((each) => each.href);
    expect(new Set(hrefs).size).toBe(hrefs.length);
  });

  it('runs the installed app in the mode iOS shows startup images in', () => {
    expect(splashHead().meta).toContainEqual({
      name: 'apple-mobile-web-app-capable',
      content: 'yes',
    });
  });

  it('draws an iPad held sideways as wide as it is held', () => {
    const sideways = splashScreens.find((each) =>
      each.media.includes(
        '(device-width: 1032px) and (device-height: 1376px) and (-webkit-device-pixel-ratio: 2) and (orientation: landscape)',
      ),
    );
    expect(sideways).toMatchObject({ width: 2752, height: 2064 });
  });
});
