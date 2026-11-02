// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Chip } from '../chip.tsx';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

/* An image attached to the Draft: its thumbnail opens it whole, to zoom into. */

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

const image = { name: 'shot.png', mime: 'image/png', data: 'iVBOR', size: 5 };

describe('an image on the Draft', () => {
  it('opens whole from its thumbnail, and still comes off by its own button', () => {
    const onRemove = vi.fn();
    act(() =>
      root.render(
        <Chip attachment={image} disabled={false} onRemove={onRemove} />,
      ),
    );
    act(() =>
      container
        .querySelector<HTMLButtonElement>('button[aria-label="Open shot.png"]')!
        .click(),
    );
    expect(
      document
        .querySelector('[data-slot="image-viewer"] img')
        ?.getAttribute('src'),
    ).toBe('data:image/png;base64,iVBOR');
    expect(onRemove).not.toHaveBeenCalled();
    act(() =>
      container
        .querySelector<HTMLButtonElement>(
          'button[aria-label="Remove shot.png"]',
        )!
        .click(),
    );
    expect(onRemove).toHaveBeenCalledOnce();
  });
});
