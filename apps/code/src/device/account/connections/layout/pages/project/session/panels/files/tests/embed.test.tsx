// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Markdown, MarkdownImages } from '../../../transcript/words/index.ts';
import { drawEmbed, type Embeds, EmbedsContext } from '../embed.tsx';
import { type Entry, keyOf, type Ticket } from '../files.ts';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

/*
 * Only `![caption](files:<path>)` is a File Embed: drawn where it was
 * written, asked for as it comes into view, and opened by a click. Any
 * other image or link stays as markdown draws it.
 */

const embed = {
  message: 'r1',
  connectionId: 'm1',
  base: '/work',
  path: 'out/chart.png',
};

const ticket = (over: Partial<Ticket> = {}): Ticket => ({
  path: '/work/out/chart.png',
  name: 'chart.png',
  kind: 'image',
  mime: 'image/png',
  size: 2048,
  url: 'https://m1.test/files/public/t/chart.png',
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
});

/** Draws `text` as the transcript does, in the Message `r1`, its embeds kept as `tickets` say. */
const draw = (
  text: string,
  tickets: Record<string, Entry> = {},
  base: string | null = '/work',
  message = 'r1',
) => {
  const embeds: Embeds = {
    connectionId: 'm1',
    base,
    tickets,
    want: vi.fn(),
    broke: vi.fn(),
    open: vi.fn(),
  };
  act(() =>
    root.render(
      <EmbedsContext value={embeds}>
        <MarkdownImages value={drawEmbed}>
          <Markdown text={text} message={message} />
        </MarkdownImages>
      </EmbedsContext>,
    ),
  );
  return embeds;
};

describe('a File Embed', () => {
  it('asks for its ticket once in view, waiting in its line', () => {
    const embeds = draw('Here: ![The chart](files:out/chart.png) and more.');
    expect(embeds.want).toHaveBeenCalledWith(embed, expect.any(Number));
    expect(container.querySelector('[role=status]')?.textContent).toContain(
      'The chart',
    );
    // Inside the paragraph markdown puts it in: no block element there.
    expect(container.querySelector('p div, p p')).toBeNull();
  });

  it('asks nothing until the folder its path is read from is known', () => {
    const embeds = draw('![The chart](files:out/chart.png)', {}, null);
    expect(embeds.want).not.toHaveBeenCalled();
  });

  it('shows an image as a preview, opened by a click', () => {
    const embeds = draw('![The chart](files:out/chart.png)', {
      [keyOf(embed)]: { _tag: 'Given', ticket: ticket(), retried: false },
    });
    expect(embeds.want).not.toHaveBeenCalled();
    const image = container.querySelector('img');
    expect(image?.getAttribute('src')).toBe(ticket().url);
    act(() => container.querySelector('button')?.click());
    expect(embeds.open).toHaveBeenCalledWith(embed, 'The chart');
    // Its URL failing to load is said, to be asked again.
    act(() => {
      image?.dispatchEvent(new Event('error'));
    });
    expect(embeds.broke).toHaveBeenCalledWith(embed, ticket().url);
  });

  it('shows a page, a PDF, a sound or markdown as a card with its caption and name', () => {
    const report = { ...embed, path: 'report.md' };
    draw('![The report](files:report.md)', {
      [keyOf(report)]: {
        _tag: 'Given',
        ticket: ticket({ kind: 'markdown', name: 'report.md' }),
        retried: false,
      },
    });
    const card = container.querySelector('button');
    expect(card?.textContent).toContain('The report');
    expect(card?.textContent).toContain('report.md');
    expect(card?.getAttribute('aria-label')).toBe('Open The report, Markdown');
  });

  it('says why it has none in its line, not on hover alone, its caption and path dimmed', () => {
    draw('Here: ![The chart](files:out/chart.png) and more.', {
      [keyOf(embed)]: {
        _tag: 'Refused',
        reason: 'Unreadable: EACCES',
        at: Date.now(),
      },
    });
    const refused = container.querySelector('[title="Unreadable: EACCES"]');
    expect(refused?.textContent).toContain('out/chart.png');
    const shown = [...(refused?.querySelectorAll('span') ?? [])].find(
      (each) => each.textContent === ': Unreadable: EACCES',
    );
    expect(shown).toBeDefined();
    expect(shown?.closest('.opacity-60')).toBeNull();
    expect(refused?.querySelector('span.opacity-60')?.textContent).toContain(
      'The chart',
    );
    expect(container.querySelector('button')).toBeNull();
    // Still inside the paragraph markdown puts it in.
    expect(container.querySelector('p div, p p')).toBeNull();
  });

  it('is asked for again in a later Message, the same file at a URL of its own', () => {
    const first = draw('![The chart](files:out/chart.png)', {
      [keyOf(embed)]: { _tag: 'Given', ticket: ticket(), retried: false },
    });
    expect(first.want).not.toHaveBeenCalled();
    const later = draw(
      '![The chart](files:out/chart.png)',
      { [keyOf(embed)]: { _tag: 'Given', ticket: ticket(), retried: false } },
      '/work',
      'r2',
    );
    expect(later.want).toHaveBeenCalledWith(
      { ...embed, message: 'r2' },
      expect.any(Number),
    );
  });

  it('outside any Message, is kept by its Connection, base and path alone', () => {
    const want = vi.fn();
    act(() =>
      root.render(
        <EmbedsContext
          value={{
            connectionId: 'm1',
            base: '/work',
            tickets: {},
            want,
            broke: vi.fn(),
            open: vi.fn(),
          }}
        >
          <MarkdownImages value={drawEmbed}>
            <Markdown text="![x](files:out/chart.png)" />
          </MarkdownImages>
        </EmbedsContext>,
      ),
    );
    expect(want).toHaveBeenCalledWith(
      { ...embed, message: '' },
      expect.any(Number),
    );
  });

  it('reads a path written with spaces, as markdown encodes it', () => {
    const spaced = { ...embed, path: 'out/my chart.png' };
    const embeds = draw('![x](<files:out/my chart.png>)');
    expect(embeds.want).toHaveBeenCalledWith(spaced, expect.any(Number));
  });
});

describe('any other image or link', () => {
  it('stays as markdown draws it', () => {
    const embeds = draw(
      '![logo](https://x.test/logo.png) and [the chart](out/chart.png)',
    );
    expect(container.querySelector('img')?.getAttribute('src')).toBe(
      'https://x.test/logo.png',
    );
    expect(container.querySelector('a')?.getAttribute('href')).toBe(
      'out/chart.png',
    );
    expect(embeds.want).not.toHaveBeenCalled();
  });

  it('is not an embed as a link to `files:`', () => {
    const embeds = draw('[the chart](files:out/chart.png)');
    expect(container.querySelector('button, img')).toBeNull();
    expect(embeds.want).not.toHaveBeenCalled();
  });
});
