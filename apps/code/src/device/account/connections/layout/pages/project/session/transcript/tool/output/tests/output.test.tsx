// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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
  background: false,
  job: null,
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
        .querySelector('[data-slot="image-viewer"] img')
        ?.getAttribute('src'),
    ).toBe('data:image/png;base64,iVBOR');
    // Its own backdrop only, no dialog's dimming under it.
    expect(document.querySelector('[data-slot="dialog-overlay"]')).toBe(null);
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
        `[data-slot="image-viewer"] button[aria-label="${label}"]`,
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
    expect(document.querySelector('[data-slot="image-viewer"] img')).toBe(null);
  });

  // Its buttons, its backdrop, the dialog itself: none left to fade out.
  const gone = () => {
    expect(document.querySelector('button[aria-label="Zoom in"]')).toBe(null);
    expect(document.querySelector('[data-slot="image-viewer"]')).toBe(null);
  };
  const opened = () => {
    act(() => root.render(<Output row={read('')} opening={opening} />));
    act(() =>
      container
        .querySelector<HTMLButtonElement>('button[aria-label="Open image 1"]')!
        .click(),
    );
    expect(
      document.querySelector('button[aria-label="Zoom in"]'),
    ).not.toBeNull();
  };

  it('is gone at once, its buttons with it, by its close button', () => {
    opened();
    act(() =>
      document
        .querySelector<HTMLButtonElement>('button[aria-label="Close"]')!
        .click(),
    );
    gone();
  });

  it('is gone at once on Escape', () => {
    opened();
    act(() => {
      document.activeElement?.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
      );
    });
    gone();
  });

  it('is gone at once on a click on its backdrop', () => {
    opened();
    act(() =>
      document
        .querySelector<HTMLElement>('[data-slot="image-viewer"] img')!
        .parentElement!.click(),
    );
    gone();
  });

  it('closes at once on a finger swiped down past 80px, through its Gesture Zone, the image sliding on', async () => {
    act(() => root.render(<Output row={read('')} opening={opening} />));
    act(() =>
      container
        .querySelector<HTMLButtonElement>('button[aria-label="Open image 1"]')!
        .click(),
    );
    const image = () =>
      document.querySelector('[data-slot="image-viewer"] img');
    // jsdom has no PointerEvent: a MouseEvent with a pointer id stands in.
    const finger = (type: string, y: number) => {
      const event = new MouseEvent(type, {
        bubbles: true,
        cancelable: true,
        clientX: 100,
        clientY: y,
        button: 0,
      });
      Object.assign(event, { pointerId: 1, pointerType: 'touch' });
      image()!.dispatchEvent(event);
    };
    act(() => finger('pointerdown', 100));
    for (let y = 110; y <= 220; y += 10) act(() => finger('pointermove', y));
    act(() => finger('pointerup', 220));
    // Past the threshold, it is closed at once: only the image slides on,
    // out of the way of the page under.
    gone();
    const leaving = () =>
      document.querySelector<HTMLElement>('[data-image-leaving]');
    expect(leaving()?.querySelector('img')?.getAttribute('src')).toBe(
      'data:image/png;base64,iVBOR',
    );
    expect(leaving()?.className).toContain('pointer-events-none');
    await vi.waitFor(() => expect(leaving()).toBe(null), { timeout: 3000 });
  });
});
