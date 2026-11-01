// @vitest-environment jsdom
import { act, useCallback, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Row } from '../turns/rows/index.ts';
import { Rows, useOpening } from '../index.ts';
import { Scrolled, useScroller } from '../../scroller/index.ts';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

/*
 * A long transcript in its scroller: it opens on its last blocks, draws
 * more above as the reader nears the top of them, and all of them to go
 * to the top; outside a scroller it draws every one; and a fold opens by
 * itself, whatever else is drawn. jsdom lays nothing out and has no
 * IntersectionObserver, nor `elementFromPoint`: the observer here says
 * the mark is near once `near` is.
 */

let near = false;
class Near {
  readonly #callback: IntersectionObserverCallback;
  constructor(callback: IntersectionObserverCallback) {
    this.#callback = callback;
  }
  observe(target: Element) {
    this.#callback(
      [{ isIntersecting: near, target } as IntersectionObserverEntry],
      this as unknown as IntersectionObserver,
    );
  }
  disconnect() {}
}

/** `count` turns, each named by its place after `prefix`. */
const turns = (count: number, prefix = ''): ReadonlyArray<Row> =>
  Array.from({ length: count }, (_, n): Row[] => {
    const at = `${prefix}${n}`;
    return [
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
    ];
  }).flat();

function Transcript({
  rows,
  scrolled = false,
  earlier,
}: {
  readonly rows: ReadonlyArray<Row>;
  /** In a scroller, as the session page draws it. */
  readonly scrolled?: boolean;
  /** What a fork carries on from, drawn whole before its own. */
  readonly earlier?: ReadonlyArray<Row>;
}) {
  const scroll = useScroller('session', 'transcript');
  toTop = scroll.toTop;
  const [open, setOpen] = useState<ReadonlyArray<string>>([]);
  const toggle = useCallback(
    (id: string) =>
      setOpen((open) =>
        open.includes(id) ? open.filter((each) => each !== id) : [...open, id],
      ),
    [],
  );
  const opening = useOpening(open, toggle);
  const rowsOf = (
    <>
      {earlier && (
        <Rows rows={earlier} opening={opening} running={false} whole />
      )}
      <Rows rows={rows} opening={opening} running={false} />
    </>
  );
  return (
    <div ref={scroll.scroller} style={{ overflowY: 'auto' }}>
      <div ref={scroll.content}>
        {scrolled ? (
          <Scrolled value={scroll.scroll}>{rowsOf}</Scrolled>
        ) : (
          rowsOf
        )}
      </div>
    </div>
  );
}

let container: HTMLDivElement;
let root: Root;
let toTop: () => void = () => {};

beforeEach(() => {
  near = false;
  Object.assign(globalThis, { IntersectionObserver: Near });
  // jsdom lays nothing out, so no point holds anything.
  document.elementFromPoint = () => null;
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  delete (globalThis as { IntersectionObserver?: unknown })
    .IntersectionObserver;
});

const drawn = () => container.querySelectorAll('[data-block]').length;

const settle = async () => {
  for (let at = 0; at < 10; at++)
    await act(() => new Promise((resolve) => setTimeout(resolve, 0)));
};

describe('a long transcript', () => {
  // Each turn is four blocks: the ask, its work, what it said, its end.
  it('opens on its last blocks, and draws no more while the reader is not near the top', async () => {
    act(() => root.render(<Transcript rows={turns(30)} scrolled />));
    expect(drawn()).toBe(30);
    expect(container.textContent).toContain('Answer 29');
    expect(container.textContent).not.toContain('Answer 0');
    await settle();
    expect(drawn()).toBe(30);
  });

  it('draws more above each time the reader nears the top of what is drawn', async () => {
    near = true;
    act(() => root.render(<Transcript rows={turns(30)} scrolled />));
    await settle();
    expect(drawn()).toBe(30 * 4);
    expect(container.textContent).toContain('Answer 0');
  });

  it('draws every block to go to the top', () => {
    act(() => root.render(<Transcript rows={turns(30)} scrolled />));
    act(() => toTop());
    expect(drawn()).toBe(30 * 4);
  });

  it('opens on its own last blocks under what a fork carries on from, drawn whole', () => {
    act(() =>
      root.render(
        <Transcript rows={turns(30)} earlier={turns(3, 'e')} scrolled />,
      ),
    );
    expect(drawn()).toBe(3 * 4 + 30);
    expect(container.textContent).toContain('Answer e0');
    expect(container.textContent).not.toContain('Answer 0');
  });

  it('draws every block at once outside a scroller', () => {
    act(() => root.render(<Transcript rows={turns(30)} />));
    expect(drawn()).toBe(30 * 4);
  });

  it('draws a turn arriving, keeping what it drew above', () => {
    act(() => root.render(<Transcript rows={turns(30)} scrolled />));
    act(() => root.render(<Transcript rows={turns(31)} scrolled />));
    expect(container.textContent).toContain('Answer 30');
    expect(drawn()).toBe(30 + 4);
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
