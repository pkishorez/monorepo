// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';
import { Loading } from '../loading.tsx';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

/*
 * A page with nothing to draw yet says what it loads, in one line with a
 * spinner, only once the wait is long enough to see.
 */

let root: Root | undefined;

afterEach(async () => {
  await act(async () => root?.unmount());
  root = undefined;
  document.body.innerHTML = '';
});

describe('a page loading', () => {
  it('says what it loads, with a spinner, once the wait is long enough to see', async () => {
    root = createRoot(document.body.appendChild(document.createElement('div')));
    await act(async () => root!.render(<Loading>Loading session…</Loading>));
    // One status, its words; the spinner is only seen.
    const status = document.querySelectorAll(
      '[role="status"]:not([aria-hidden="true"])',
    );
    expect(status).toHaveLength(1);
    expect(status[0]!.textContent).toBe('Loading session…');
    expect(
      status[0]!
        .querySelector('[data-slot="spinner"]')
        ?.getAttribute('aria-hidden'),
    ).toBe('true');
    // Shown after a wait, as the sign-in screen's checking is.
    expect(status[0]!.classList.contains('animate-arrive')).toBe(true);
  });
});
