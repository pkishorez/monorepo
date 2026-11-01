// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Row } from '../../../turns/rows/index.ts';
import { SHUT } from '../../../words/index.ts';
import { Output } from '../output.tsx';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

/* What a tool gave back: its images as thumbnails, opened whole by a tap, to zoom into. */

type ToolRow = Extract<Row, { readonly kind: 'tool' }>;

const opening = SHUT;

const read = (output: string): ToolRow => ({
  kind: 'tool',
  id: 'r',
  call: {
    type: 'toolCall',
    id: 'r',
    tool: 'read',
    name: 'Read',
    title: 'shot.png',
    input: { file_path: 'shot.png' },
  },
  result: {
    type: 'toolResult',
    toolCallId: 'r',
    output,
    truncated: false,
    isError: false,
    images: [{ mediaType: 'image/png', data: 'iVBOR' }],
  },
  answered: null,
  state: 'done',
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

describe('a tool that gave back an image', () => {
  it('shows it as a thumbnail, with no empty output over it', () => {
    act(() => root.render(<Output row={read('')} opening={opening} />));
    const image = container.querySelector('img');
    expect(image?.getAttribute('src')).toBe('data:image/png;base64,iVBOR');
    expect(container.textContent).not.toContain('(no output)');
  });

  it('opens it whole over the page on a tap', () => {
    act(() =>
      root.render(<Output row={read('A screenshot')} opening={opening} />),
    );
    expect(container.textContent).toContain('A screenshot');
    act(() =>
      container
        .querySelector<HTMLButtonElement>('button[aria-label="Open image 1"]')!
        .click(),
    );
    expect(
      document
        .querySelector('[data-slot="dialog-content"] img')
        ?.getAttribute('src'),
    ).toBe('data:image/png;base64,iVBOR');
    // Beside the dialog's own dimming, which the app's styles hide for it.
    expect(
      document.querySelector(
        '[data-slot="dialog-overlay"] ~ [data-image-viewer]',
      ),
    ).not.toBeNull();
  });

  it('zooms in and out by its buttons, back to fit, then closes', () => {
    act(() => root.render(<Output row={read('')} opening={opening} />));
    act(() =>
      container
        .querySelector<HTMLButtonElement>('button[aria-label="Open image 1"]')!
        .click(),
    );
    const button = (label: string) =>
      document.querySelector<HTMLButtonElement>(
        `[data-slot="dialog-content"] button[aria-label="${label}"]`,
      )!;
    const zoom = () => button('Fit to screen').textContent;
    expect(zoom()).toBe('100%');
    expect(button('Zoom out').disabled).toBe(true);
    act(() => button('Zoom in').click());
    expect(zoom()).toBe('150%');
    act(() => button('Zoom out').click());
    expect(zoom()).toBe('100%');
    act(() => button('Zoom in').click());
    act(() => button('Fit to screen').click());
    expect(zoom()).toBe('100%');
    act(() => button('Close').click());
    expect(document.querySelector('[data-slot="dialog-content"] img')).toBe(
      null,
    );
  });
});
