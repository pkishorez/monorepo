// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MarkdownImages } from '../../../transcript/words/index.ts';
import { drawEmbed, type Embeds, EmbedsContext } from '../embed.tsx';
import { type Entry, keyOf, type Ticket } from '../files.ts';
import { folderOf, FileViewer } from '../viewer.tsx';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

/*
 * An embed opened whole: a page sandboxed with no same-origin, one not
 * there said to the page, a markdown file read with its own embeds
 * read from its own folder, and its caption and buttons, an image's
 * among them.
 */

const viewing = (path: string) => ({
  message: 'r1',
  connectionId: 'm1',
  base: '/work',
  path,
  caption: 'Opened',
});

const ticket = (over: Partial<Ticket>): Ticket => ({
  path: '/work/out/page.html',
  name: 'page.html',
  kind: 'html',
  mime: 'text/html; charset=utf-8',
  size: 100,
  url: 'https://m1.test/files/public/t/page.html',
  expiresAt: Date.now() + 60 * 60 * 1000,
  ...over,
});

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.body.appendChild(document.createElement('div'));
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

const settle = () => act(() => new Promise((done) => setTimeout(done, 0)));

const open = (path: string, entry: Entry, onClose = () => {}) => {
  const shown = viewing(path);
  const embeds: Embeds = {
    connectionId: 'm1',
    base: '/work',
    tickets: { [keyOf(shown)]: entry },
    want: vi.fn(),
    broke: vi.fn(),
    open: vi.fn(),
  };
  act(() =>
    root.render(
      <EmbedsContext value={embeds}>
        <MarkdownImages value={drawEmbed}>
          <FileViewer viewing={shown} onClose={onClose} />
        </MarkdownImages>
      </EmbedsContext>,
    ),
  );
  return embeds;
};

describe('the viewer', () => {
  it('runs a page sandboxed, never same-origin, once it is there', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('<p>hi</p>', { status: 200 })),
    );
    open('out/page.html', {
      _tag: 'Given',
      ticket: ticket({}),
      retried: false,
    });
    await settle();
    const frame = document.querySelector('iframe');
    expect(frame?.getAttribute('sandbox')).toBe(
      'allow-scripts allow-popups allow-forms allow-modals',
    );
    expect(frame?.getAttribute('referrerpolicy')).toBe('no-referrer');
    expect(document.body.textContent).toContain('Opened');
  });

  it('says a file no longer there to the page', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('', { status: 404 })),
    );
    const embeds = open('out/page.html', {
      _tag: 'Given',
      ticket: ticket({}),
      retried: false,
    });
    await settle();
    expect(embeds.broke).toHaveBeenCalledWith(
      viewing('out/page.html'),
      ticket({}).url,
    );
    expect(document.querySelector('iframe')).toBeNull();
  });

  it('reads markdown with its embeds read from its own folder', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response('# Notes\n\n![Inner](files:img/a.png)', { status: 200 }),
      ),
    );
    const embeds = open('docs/notes.md', {
      _tag: 'Given',
      ticket: ticket({
        kind: 'markdown',
        path: '/work/docs/notes.md',
        name: 'notes.md',
        url: 'https://m1.test/files/public/t/notes.md',
      }),
      retried: false,
    });
    await settle();
    expect(document.body.textContent).toContain('Notes');
    expect(embeds.want).toHaveBeenCalledWith(
      {
        message: 'https://m1.test/files/public/t/notes.md',
        connectionId: 'm1',
        base: '/work/docs',
        path: 'img/a.png',
      },
      expect.any(Number),
    );
  });
});

describe('its buttons', () => {
  const button = (label: string) =>
    document.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`);

  it('show its caption, and its name, kind and size beside it', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('', { status: 200 })),
    );
    open('out/page.html', {
      _tag: 'Given',
      ticket: ticket({}),
      retried: false,
    });
    await settle();
    expect(document.body.textContent).toContain('page.html · Page · 100 B');
  });

  it('open an image in a new tab too', async () => {
    const opened = vi.fn();
    vi.stubGlobal('open', opened);
    const shot = ticket({
      kind: 'image',
      path: '/work/out/shot.png',
      name: 'shot.png',
      url: 'https://m1.test/files/public/t/shot.png',
    });
    open('out/shot.png', { _tag: 'Given', ticket: shot, retried: false });
    await settle();
    expect(document.querySelector('[data-slot="image-viewer"]')).not.toBeNull();
    act(() => button('Open in new tab')?.click());
    expect(opened).toHaveBeenCalledWith(
      shot.url,
      '_blank',
      'noopener,noreferrer',
    );
  });

  it('close it', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('', { status: 200 })),
    );
    const onClose = vi.fn();
    open(
      'out/page.html',
      { _tag: 'Given', ticket: ticket({}), retried: false },
      onClose,
    );
    await settle();
    act(() => button('Close')?.click());
    expect(onClose).toHaveBeenCalled();
  });
});

describe('a folder of a path', () => {
  it('is all before its last segment', () => {
    expect(folderOf('/work/docs/notes.md')).toBe('/work/docs');
    expect(folderOf('/notes.md')).toBe('/');
  });
});
