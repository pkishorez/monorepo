// @vitest-environment jsdom
import { act, useCallback, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Row } from '../turns/rows/index.ts';
import { Rows, useOpening } from '../index.ts';
import { Scrolled, useScroller } from '../../scroller/index.ts';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

/*
 * A long transcript in its scroller: it opens on its last blocks, an
 * answer's words a block for each of their blocks, draws more above while
 * what is drawn there is not enough, but not while a touch glides it, and
 * all of them to go to the top;
 * outside a scroller it draws every one; and a fold opens by itself,
 * whatever else is drawn. jsdom lays nothing out: once `room` is, every
 * element is a view tall at the top, so what is drawn is never enough.
 */

let room = false;
const laidOut = Element.prototype.getBoundingClientRect;

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
  room = false;
  Element.prototype.getBoundingClientRect = function () {
    return room
      ? DOMRect.fromRect({ x: 0, y: 0, width: 400, height: 800 })
      : laidOut.call(this);
  };
  // jsdom lays nothing out, so no point holds anything.
  document.elementFromPoint = () => null;
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  Element.prototype.getBoundingClientRect = laidOut;
});

const drawn = () => container.querySelectorAll('[data-block]').length;

const settle = async () => {
  for (let at = 0; at < 10; at++)
    await act(() => new Promise((resolve) => setTimeout(resolve, 0)));
};

describe('a long transcript', () => {
  // Each turn is four blocks: the ask, its work, what it said, its end.
  it('opens on its last ten blocks, while nothing says more is needed', async () => {
    act(() => root.render(<Transcript rows={turns(30)} scrolled />));
    expect(drawn()).toBe(10);
    expect(container.textContent).toContain('Answer 29');
    expect(container.textContent).not.toContain('Answer 0');
    expect(container.textContent).toContain('Loading earlier messages');
    await settle();
    expect(drawn()).toBe(10);
  });

  it('draws ten more at a time while what is drawn above the view is not enough', () => {
    room = true;
    act(() => root.render(<Transcript rows={turns(30)} scrolled />));
    expect(drawn()).toBe(30 * 4);
    expect(container.textContent).toContain('Answer 0');
  });

  it('draws a long answer a block of its words at a time', () => {
    const words = Array.from({ length: 40 }, (_, at) => `Paragraph ${at}.`);
    const rows = turns(1).map((row) =>
      row.kind === 'text' ? { ...row, text: words.join('\n\n') } : row,
    );
    act(() => root.render(<Transcript rows={rows} scrolled />));
    // Its last nine blocks of words and the turn's end; its ask, its work
    // and its first words not yet.
    expect(drawn()).toBe(10);
    expect(container.textContent).toContain('Paragraph 39.');
    expect(container.textContent).not.toContain('Paragraph 30.');
    expect(container.textContent).not.toContain('Ask 0');
  });

  it('keeps drawing from where it was when the blocks of an answer become one', () => {
    const words = Array.from({ length: 40 }, (_, at) => `Paragraph ${at}.`);
    const answer = (text: string) =>
      [...turns(29, 'p'), ...turns(1)].map((row) =>
        row.kind === 'text' && row.id === 't0:said' ? { ...row, text } : row,
      );
    act(() =>
      root.render(<Transcript rows={answer(words.join('\n\n'))} scrolled />),
    );
    expect(drawn()).toBe(10);
    // A footnote: its words reach across blocks, so they are one block.
    act(() =>
      root.render(
        <Transcript
          rows={answer(`${words.join('\n\n')}[^1]\n\n[^1]: A note.`)}
          scrolled
        />,
      ),
    );
    expect(drawn()).toBeLessThan(10);
  });

  it('draws nothing above while a touch glides the view, and draws it once the glide settles', async () => {
    act(() => root.render(<Transcript rows={turns(30)} scrolled />));
    const scroller = container.firstElementChild as HTMLElement;
    let top = 0;
    Object.defineProperty(scroller, 'scrollTop', {
      configurable: true,
      get: () => top,
      set: (to: number) => {
        top = to;
      },
    });
    const touch = (type: string) =>
      act(() =>
        scroller.dispatchEvent(
          Object.assign(new Event(type), { touches: [] as Touch[] }),
        ),
      );
    const glide = () =>
      act(() => {
        top += 40;
        scroller.dispatchEvent(new Event('scroll'));
      });
    touch('touchstart');
    room = true;
    glide();
    touch('touchend');
    // Its glide goes on after the finger lifts.
    glide();
    await act(() => new Promise((resolve) => setTimeout(resolve, 100)));
    glide();
    expect(drawn()).toBe(10);
    await act(() => new Promise((resolve) => setTimeout(resolve, 200)));
    await settle();
    expect(drawn()).toBe(30 * 4);
  });

  it('settles a touch whose end never comes, as when what it touched is taken away', async () => {
    act(() => root.render(<Transcript rows={turns(30)} scrolled />));
    const scroller = container.firstElementChild as HTMLElement;
    act(() => scroller.dispatchEvent(new Event('touchstart')));
    room = true;
    expect(drawn()).toBe(10);
    await act(() => new Promise((resolve) => setTimeout(resolve, 200)));
    await settle();
    expect(drawn()).toBe(30 * 4);
  });

  it('does not bounce within a view of the top while more is above, so a glide stops there', () => {
    act(() => root.render(<Transcript rows={turns(30)} scrolled />));
    const scroller = container.firstElementChild as HTMLElement;
    let top = 2000;
    Object.defineProperties(scroller, {
      clientHeight: { configurable: true, get: () => 800 },
      scrollTop: {
        configurable: true,
        get: () => top,
        set: (to: number) => {
          top = to;
        },
      },
    });
    const scrollTo = (to: number) =>
      act(() => {
        top = to;
        scroller.dispatchEvent(new Event('scroll'));
      });
    scrollTo(1000);
    expect(scroller.style.overscrollBehaviorY).toBe('');
    scrollTo(300);
    expect(scroller.style.overscrollBehaviorY).toBe('none');
    act(() => toTop());
    scrollTo(10);
    expect(scroller.style.overscrollBehaviorY).toBe('');
  });

  it('draws every block to go to the top', () => {
    act(() => root.render(<Transcript rows={turns(30)} scrolled />));
    act(() => toTop());
    expect(drawn()).toBe(30 * 4);
    expect(container.textContent).not.toContain('Loading earlier messages');
  });

  it('opens on its own last blocks under what a fork carries on from, drawn whole', () => {
    act(() =>
      root.render(
        <Transcript rows={turns(30)} earlier={turns(3, 'e')} scrolled />,
      ),
    );
    expect(drawn()).toBe(3 * 4 + 10);
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
    expect(drawn()).toBe(10 + 4);
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
