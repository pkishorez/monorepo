import { describe, expect, it } from 'vitest';
import { expectUpgradable } from '@kestack/std-toolkit/eschema/testing';
import { publicOfPath } from '../../../../../cloud/contract/index.js';
import { versionedValuesOf } from '../../../../../cloud/contract/tests/versioned.js';
import {
  embedPath,
  extensionOf,
  FILE_EXTENSIONS,
  FILE_KINDS,
  FILE_TYPES,
  FilesApi,
  fileTypeOf,
  ticketPath,
} from '../index.js';

/*
 * The files Plugin shows a file by its extension alone, a File Embed is
 * `files:<path>`, and a File Ticket is a path in its Public Area the router
 * lets in. Every value it sends is an ESchema, as the code Plugin's are.
 */

const TOKEN = 'a'.repeat(64);

describe('the kind of a file', () => {
  it.each([
    ['chart.png', 'image', 'image/png'],
    ['photo.JPG', 'image', 'image/jpeg'],
    ['photo.jpeg', 'image', 'image/jpeg'],
    ['logo.svg', 'image', 'image/svg+xml'],
    ['clip.mov', 'video', 'video/quicktime'],
    ['clip.webm', 'video', 'video/webm'],
    ['voice.m4a', 'audio', 'audio/mp4'],
    ['song.mp3', 'audio', 'audio/mpeg'],
    ['report.pdf', 'pdf', 'application/pdf'],
    ['/tmp/out/chart.html', 'html', 'text/html; charset=utf-8'],
    ['page.htm', 'html', 'text/html; charset=utf-8'],
    ['notes.md', 'markdown', 'text/markdown; charset=utf-8'],
    ['notes.markdown', 'markdown', 'text/markdown; charset=utf-8'],
  ])('%s is %s, sent as %s', (name, kind, mime) => {
    expect(fileTypeOf(name)).toEqual({ kind, mime });
  });

  it.each([
    'secrets.txt',
    'package.json',
    '.env',
    'Makefile',
    'archive.tar.gz',
    'trailing.',
    'folder.png/inside',
    'constructor',
    'x.__proto__',
    'x.toString',
  ])('%s is not shown', (name) => {
    expect(fileTypeOf(name)).toBeNull();
  });

  it('reads the extension of the last segment, lowercase, empty for none', () => {
    expect(extensionOf('/a.b/c.TXT')).toBe('txt');
    expect(extensionOf('/a.b/c')).toBe('');
    expect(extensionOf('.bashrc')).toBe('');
    expect(extensionOf('archive.tar.gz')).toBe('gz');
  });

  it('names every extension in the table, each of a known kind', () => {
    expect(FILE_EXTENSIONS).toEqual(Object.keys(FILE_TYPES));
    expect(FILE_EXTENSIONS).toContain('png');
    expect(FILE_EXTENSIONS).toContain('markdown');
    for (const extension of FILE_EXTENSIONS)
      expect(FILE_KINDS).toContain(FILE_TYPES[extension]!.kind);
  });
});

describe('a File Embed', () => {
  it.each([
    ['files:/Users/me/out/chart.png', '/Users/me/out/chart.png'],
    ['files:out/chart.png', 'out/chart.png'],
    ['FILES:out/chart.png', 'out/chart.png'],
    ['files:/Users/me/my%20chart.png', '/Users/me/my chart.png'],
    ['files:/Users/me/100%.png', '/Users/me/100%.png'],
    ['  files:a.md  ', 'a.md'],
  ])('%s names %s', (href, path) => {
    expect(embedPath(href)).toBe(path);
  });

  it.each([
    'https://example.com/a.png',
    '/Users/me/a.png',
    'file:/Users/me/a.png',
    'files:',
    'files:   ',
    '',
  ])('%s is none', (href) => {
    expect(embedPath(href)).toBeNull();
  });
});

describe('a File Ticket', () => {
  it('is in the Public Area, its filename encoded', () => {
    expect(ticketPath(TOKEN, 'my chart.png')).toBe(
      `/files/public/${TOKEN}/my%20chart.png`,
    );
  });

  it.each(['chart.png', 'my chart (1).png', 'ä#?.md', 'a\\b.png', '...', ''])(
    'is a path the router lets in for %j',
    (name) => {
      const path = ticketPath(TOKEN, name);
      expect(publicOfPath(path)?.name).toBe('files');
    },
  );
});

const { problems, eschemas } = versionedValuesOf(FilesApi);

describe('files Plugin contract', () => {
  it('sends every payload, success and error field as an ESchema', () => {
    expect(problems).toEqual([]);
  });

  it.each(eschemas.map((each) => [each.name, each] as const))(
    '%s reads every version it stored',
    async (_, eschema) => {
      await expectUpgradable(eschema);
    },
  );
});
