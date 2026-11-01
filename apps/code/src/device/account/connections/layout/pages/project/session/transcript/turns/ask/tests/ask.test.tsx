// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { type Opening, SHUT } from '../../../words/index.ts';
import { thread } from '../../rows/index.ts';
import { Ask } from '../ask.tsx';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

/* A Turn Connect Resumed after a restart shows a marker, not its prompt. */

const PROMPT =
  'Connect restarted and cut off your last turn, possibly in the middle of a tool call.';

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

describe('a Resumed Turn', () => {
  it('shows the marker in place of the prompt Connect sent', () => {
    const [row] = thread([
      {
        id: 'm1',
        sessionId: 's',
        turnId: 't1',
        agentId: null,
        role: 'user',
        parts: [
          { type: 'turnStarted', text: PROMPT, steered: false, resumed: true },
        ],
        at: 1,
      },
    ]);
    if (row?.kind !== 'turn') throw new Error('expected a turn row');
    act(() => root.render(<Ask row={row} opening={SHUT} />));
    expect(container.textContent).toContain('Resumed after Connect restarted');
    expect(container.textContent).not.toContain(PROMPT);
  });
});

/* What you asked: copied from under it, and folded while tall. */

const asked = (text: string) => {
  const [row] = thread([
    {
      id: 'm2',
      sessionId: 's',
      turnId: 't2',
      agentId: null,
      role: 'user',
      parts: [{ type: 'turnStarted', text, steered: false, resumed: false }],
      at: 1,
    },
  ]);
  if (row?.kind !== 'turn') throw new Error('expected a turn row');
  return row;
};

/** Folds kept here, as the session keeps them. */
const folds = (): Opening => {
  const open = new Set<string>();
  const listeners = new Set<() => void>();
  return {
    isOpen: (id) => open.has(id),
    toggle: (id) => {
      if (!open.delete(id)) open.add(id);
      for (const listener of listeners) listener();
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
};

const bubble = () =>
  container.querySelector<HTMLElement>('.whitespace-pre-wrap')!;
const button = (name: string) =>
  [...container.querySelectorAll('button')].find(
    (each) =>
      each.getAttribute('aria-label') === name || each.textContent === name,
  );

describe('a message you sent', () => {
  it('is copied from the button under it', async () => {
    const writeText = vi.fn(() => Promise.resolve());
    vi.stubGlobal('navigator', { clipboard: { writeText } });
    act(() => root.render(<Ask row={asked('Carry on')} opening={folds()} />));
    await act(async () => button('Copy the message')!.click());
    expect(writeText).toHaveBeenCalledWith('Carry on');
    expect(button('Copied')).toBeDefined();
    vi.unstubAllGlobals();
  });

  it('shows whole while short, with nothing to fold', () => {
    act(() => root.render(<Ask row={asked('Short')} opening={folds()} />));
    expect(bubble().dataset.folded).toBeUndefined();
    expect(button('Show more')).toBeUndefined();
  });

  it('folds while tall, and opens and folds again on a click', () => {
    const tall = vi
      .spyOn(HTMLElement.prototype, 'scrollHeight', 'get')
      .mockReturnValue(900);
    act(() => root.render(<Ask row={asked('Long')} opening={folds()} />));
    expect(bubble().dataset.folded).toBe('true');
    // One click, as a pointer's: a second would be selecting a word.
    act(() => {
      bubble().dispatchEvent(
        new MouseEvent('click', { bubbles: true, detail: 1 }),
      );
    });
    expect(bubble().dataset.folded).toBeUndefined();
    expect(button('Show less')).toBeDefined();
    act(() => button('Show less')!.click());
    expect(bubble().dataset.folded).toBe('true');
    tall.mockRestore();
  });
});
