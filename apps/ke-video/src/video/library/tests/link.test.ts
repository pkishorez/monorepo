import { describe, expect, it } from 'vitest';
import { idOf } from '../link.ts';

/* A Video's id read from every form of YouTube link, and nothing from others. */

const ID = 'dQw4w9WgXcQ';

describe('idOf', () => {
  it.each([
    `https://www.youtube.com/watch?v=${ID}`,
    `https://youtube.com/watch?v=${ID}&t=42s&list=PL123`,
    `https://www.youtube.com/watch?feature=share&v=${ID}`,
    `https://m.youtube.com/watch?v=${ID}`,
    `https://music.youtube.com/watch?v=${ID}`,
    `http://youtu.be/${ID}`,
    `https://youtu.be/${ID}?si=abc&t=10`,
    `https://www.youtube.com/shorts/${ID}`,
    `https://youtube.com/live/${ID}?feature=share`,
    `https://www.youtube.com/embed/${ID}?start=5`,
    `https://www.youtube-nocookie.com/embed/${ID}`,
    `youtu.be/${ID}`,
    `www.youtube.com/watch?v=${ID}`,
    `HTTPS://WWW.YOUTUBE.COM/watch?v=${ID}`,
  ])('reads the id from %s', (link) => {
    expect(idOf(link)).toBe(ID);
  });

  it('keeps the id exactly as YouTube writes it', () => {
    expect(idOf('https://youtu.be/a-B_c1D2e3F')).toBe('a-B_c1D2e3F');
  });

  it.each([
    'https://vimeo.com/123456',
    'https://www.youtube.com/watch',
    'https://www.youtube.com/watch?v=short',
    `https://www.youtube.com/channel/${ID}`,
    'https://www.youtube.com/@somechannel',
    `https://notyoutube.com/watch?v=${ID}`,
    'not a link at all',
    '',
  ])('reads no id from %s', (link) => {
    expect(idOf(link)).toBeNull();
  });
});
