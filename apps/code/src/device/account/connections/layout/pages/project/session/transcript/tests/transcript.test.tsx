// @vitest-environment jsdom
import { act, useCallback, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Row } from '../turns/rows/index.ts';
import { Rows, useOpening } from '../index.ts';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

/*
 * A long transcript: it opens on its last turns and draws the ones above
 * after, a batch at a time, all of them at once when asked; and a fold
 * opens by itself, whatever else is drawn.
 */

const turns = (count: number): ReadonlyArray<Row> =>
  Array.from({ length: count }, (_, at): Row[] => [
    {
      kind: 'turn',
      id: `t${at}`,
      text: `Ask ${at}`,
      steered: false,
      attachments: [],
      agentStarted: false,
      resumed: false,
    },
    {
      kind: 'tool',
      id: `t${at}:tool`,
      call: {
        type: 'toolCall',
        id: `c${at}`,
        tool: 'bash',
        name: 'Bash',
        title: 'ls',
        input: { command: 'ls' },
      },
      result: null,
      answered: null,
      state: 'done',
    },
    { kind: 'text', id: `t${at}:said`, text: `Answer ${at}`, writing: false },
    {
      kind: 'ended',
      id: `t${at}:end`,
      turnId: `t${at}`,
      status: 'done',
      usage: null,
      error: null,
      duration: 1000,
    },
  ]).flat();

function Transcript({
  rows,
  gradual = false,
  whole = false,
}: {
  readonly rows: ReadonlyArray<Row>;
  readonly gradual?: boolean;
  readonly whole?: boolean;
}) {
  const [open, setOpen] = useState<ReadonlyArray<string>>([]);
  const toggle = useCallback(
    (id: string) =>
      setOpen((open) =>
        open.includes(id) ? open.filter((each) => each !== id) : [...open, id],
      ),
    [],
  );
  const opening = useOpening(open, toggle);
  return (
    <div style={{ overflowY: 'auto' }}>
      <Rows
        rows={rows}
        opening={opening}
        running={false}
        gradual={gradual}
        whole={whole}
      />
    </div>
  );
}

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

const drawn = () =>
  [...container.querySelectorAll('section[data-turn]')].filter(
    (section) => !section.hasAttribute('aria-hidden'),
  ).length;
const standing = () =>
  container.querySelectorAll('section[data-turn][aria-hidden]').length;

const settle = async () => {
  for (let at = 0; at < 10; at++)
    await act(() => new Promise((resolve) => setTimeout(resolve, 0)));
};

describe('a long transcript', () => {
  it('opens on its last turns, the ones above standing in until drawn', async () => {
    const rows = turns(30);
    act(() => root.render(<Transcript rows={rows} gradual />));
    expect(drawn()).toBe(6);
    expect(standing()).toBe(24);
    expect(container.textContent).toContain('Answer 29');
    expect(container.textContent).not.toContain('Answer 0');
    await settle();
    expect(drawn()).toBe(30);
    expect(standing()).toBe(0);
    expect(container.textContent).toContain('Answer 0');
  });

  it('draws every turn at once when not gradual, or once asked for whole', () => {
    act(() => root.render(<Transcript rows={turns(30)} />));
    expect(drawn()).toBe(30);
    act(() => root.unmount());
    root = createRoot(container);
    const rows = turns(30);
    act(() => root.render(<Transcript rows={rows} gradual />));
    expect(drawn()).toBe(6);
    act(() => root.render(<Transcript rows={rows} gradual whole />));
    expect(drawn()).toBe(30);
  });

  it('draws a turn arriving at once, under the ones still standing in', () => {
    const rows = turns(30);
    act(() => root.render(<Transcript rows={rows} gradual />));
    act(() => root.render(<Transcript rows={turns(31)} gradual />));
    expect(drawn()).toBe(7);
    expect(container.textContent).toContain('Answer 30');
  });

  it('opens one fold, and only that one', () => {
    act(() => root.render(<Transcript rows={turns(3)} />));
    // The work lines', not the info under each turn.
    const FOLD = 'button[aria-expanded]:not([aria-label="About this turn"])';
    const folds = () =>
      [...container.querySelectorAll(FOLD)].map((fold) =>
        fold.getAttribute('aria-expanded'),
      );
    expect(folds()).toEqual(['false', 'false', 'false']);
    const second = container.querySelectorAll<HTMLButtonElement>(FOLD)[1]!;
    act(() => second.click());
    // Open, it shows its step, a fold of its own, shut.
    expect(folds()).toEqual(['false', 'true', 'false', 'false']);
    act(() => second.click());
    expect(folds()).toEqual(['false', 'false', 'false']);
  });
});
