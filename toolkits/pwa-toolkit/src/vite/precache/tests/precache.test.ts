import { describe, expect, it } from 'vitest';
import { selectAssets, selectDocuments } from '../index.js';

const file = (path: string, text = path) => ({
  path,
  bytes: new TextEncoder().encode(text),
});

const files = [
  file('assets/app-1.js'),
  file('assets/app-1.js.map'),
  file('assets/app-1.css'),
  file('assets/inter.woff2'),
  file('assets/photo.jpg'),
  file('icons/192.png'),
  file('index.html'),
  file('_shell.html'),
  file('offline/index.html'),
];

const options = { include: [], exclude: [], iconUrls: [], base: '/' };

describe('selectAssets', () => {
  it('takes scripts, styles, fonts and manifest icons; leaves maps, images and HTML', () => {
    const { entries, missingIcons } = selectAssets(files, {
      ...options,
      iconUrls: ['/icons/192.png', 'https://cdn.test/x.png', '/icons/512.png'],
    });
    expect(entries.map((entry) => entry.url)).toEqual([
      '/assets/app-1.js',
      '/assets/app-1.css',
      '/assets/inter.woff2',
      '/icons/192.png',
    ]);
    expect(missingIcons).toEqual(['/icons/512.png']);
  });

  it('applies include then exclude globs, and the base', () => {
    const { entries, bytes } = selectAssets(files, {
      ...options,
      include: ['assets/*.jpg'],
      exclude: ['**/*.css'],
      base: '/app',
    });
    expect(entries.map((entry) => entry.url)).toEqual([
      '/app/assets/app-1.js',
      '/app/assets/inter.woff2',
      '/app/assets/photo.jpg',
    ]);
    expect(bytes).toBe(
      'assets/app-1.js'.length +
        'assets/inter.woff2'.length +
        'assets/photo.jpg'.length,
    );
  });

  it('revisions follow content', () => {
    const [a] = selectAssets([file('a.js', 'one')], options).entries;
    const [b] = selectAssets([file('a.js', 'two')], options).entries;
    expect(a?.revision).toMatch(/^[0-9a-f]{16}$/);
    expect(a?.revision).not.toBe(b?.revision);
  });
});

describe('selectDocuments', () => {
  it('keys documents by navigation path and reports what is missing', () => {
    const result = selectDocuments(files, ['/_shell', '/offline', '/gone']);
    expect(result.entries.map((entry) => entry.url)).toEqual([
      '/_shell',
      '/offline',
    ]);
    expect(result.missing).toEqual(['/gone']);
    expect(result.subfolderIndex).toEqual(['/offline']);
  });
});
