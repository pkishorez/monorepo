// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  type GestureOptions,
  GestureProvider,
  GestureZone,
  type Pointers,
  useGesture,
} from '../index.ts';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

// jsdom has no PointerEvent: a MouseEvent with a pointer id stands in.
const pointer = (
  type: string,
  target: Element,
  id: number,
  x: number,
  y: number,
  pointerType = 'touch',
) => {
  const event = new MouseEvent(type, {
    bubbles: true,
    cancelable: true,
    composed: true,
    clientX: x,
    clientY: y,
    button: 0,
  });
  Object.assign(event, { pointerId: id, pointerType });
  target.dispatchEvent(event);
};

function Listener(props: GestureOptions & { readonly name: string }) {
  const { active } = useGesture(props);
  return <span data-testid={props.name} data-active={active} />;
}

let host: HTMLDivElement;
let root: Root;

beforeEach(() => {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

const find = (id: string) => {
  const element = host.querySelector(`[data-testid="${id}"]`);
  if (element === null) throw new Error(`no ${id}`);
  return element;
};

describe('GestureProvider, GestureZone and useGesture', () => {
  it('hands a Gesture to the zone it starts in and each untrapped zone around', () => {
    const screen = vi.fn();
    const card = vi.fn();
    const map = vi.fn();
    act(() =>
      root.render(
        <GestureProvider>
          <GestureZone data-testid="screen">
            <Listener name="on-screen" onEnd={screen} />
            <GestureZone data-testid="card">
              <Listener name="on-card" onEnd={card} />
            </GestureZone>
            <GestureZone data-testid="map">
              <Listener name="on-map" onEnd={map} />
            </GestureZone>
          </GestureZone>
        </GestureProvider>,
      ),
    );

    act(() => {
      pointer('pointerdown', find('card'), 1, 10, 10);
      pointer('pointerdown', find('map'), 2, 90, 10);
      pointer('pointermove', find('card'), 1, 10, 60);
    });
    expect(find('on-card').getAttribute('data-active')).toBe('true');
    act(() => {
      pointer('pointerup', find('card'), 1, 10, 60);
      pointer('pointerup', find('map'), 2, 90, 10);
    });

    expect(card).toHaveBeenCalledTimes(1);
    expect(screen).toHaveBeenCalledTimes(1);
    expect(map).not.toHaveBeenCalled();
    const [pointers] = card.mock.lastCall as [Pointers];
    expect([...pointers.keys()]).toEqual([1, 2]);
    expect(pointers.get(1)?.dy.get()).toBe(50);
    expect(find('on-card').getAttribute('data-active')).toBe('false');
  });

  it('keeps a Gesture in a trapped zone', () => {
    const screen = vi.fn();
    const row = vi.fn();
    act(() =>
      root.render(
        <GestureProvider>
          <GestureZone>
            <Listener name="on-screen" onEnd={screen} />
            <GestureZone data-testid="row" trapped>
              <Listener name="on-row" onEnd={row} />
            </GestureZone>
          </GestureZone>
        </GestureProvider>,
      ),
    );
    act(() => {
      pointer('pointerdown', find('row'), 1, 0, 0);
      pointer('pointerup', find('row'), 1, 0, 0);
    });
    expect(row).toHaveBeenCalledTimes(1);
    expect(screen).not.toHaveBeenCalled();
  });

  it('never starts a Gesture where the zone is disabled', () => {
    const screen = vi.fn();
    act(() =>
      root.render(
        <GestureProvider>
          <GestureZone>
            <Listener name="on-screen" onStart={screen} />
            <div data-testid="slider" data-zone-gesture="disabled" />
          </GestureZone>
        </GestureProvider>,
      ),
    );
    act(() => pointer('pointerdown', find('slider'), 1, 0, 0));
    expect(screen).not.toHaveBeenCalled();
  });

  it('leaves the mouse to the browser, but hears a pen', () => {
    const start = vi.fn();
    act(() =>
      root.render(
        <GestureProvider>
          <GestureZone data-testid="screen">
            <Listener name="on-screen" onStart={start} />
          </GestureZone>
        </GestureProvider>,
      ),
    );
    act(() => {
      pointer('pointerdown', find('screen'), 1, 0, 0, 'mouse');
      pointer('pointermove', find('screen'), 1, 0, 50, 'mouse');
      pointer('pointerup', find('screen'), 1, 0, 50, 'mouse');
    });
    expect(start).not.toHaveBeenCalled();
    act(() => pointer('pointerdown', find('screen'), 2, 0, 0, 'pen'));
    expect(start).toHaveBeenCalledTimes(1);
  });

  it('sets touch defaults as inline style that `style` overrides, and no position', () => {
    act(() =>
      root.render(
        <GestureProvider>
          <GestureZone data-testid="plain" />
          <GestureZone data-testid="own" style={{ userSelect: 'text' }} />
        </GestureProvider>,
      ),
    );
    const plain = (find('plain') as HTMLElement).style;
    expect(plain.overscrollBehavior).toBe('');
    expect(plain.userSelect).toBe('none');
    expect(plain.position).toBe('');
    expect((find('own') as HTMLElement).style.userSelect).toBe('text');
  });

  describe('over an element that scrolls', () => {
    // jsdom has no Touch: plain events carry the touch lists instead.
    const touch = (type: string, target: Element, x: number, y: number) => {
      const point = { identifier: 1, target, clientX: x, clientY: y };
      const event = new Event(type, { bubbles: true, cancelable: true });
      Object.assign(event, {
        touches: type === 'touchend' ? [] : [point],
        changedTouches: [point],
      });
      target.dispatchEvent(event);
      return event;
    };

    const scrolled = (captures: NonNullable<GestureOptions['captures']>) => {
      const onEnd = vi.fn();
      act(() =>
        root.render(
          <GestureProvider>
            <GestureZone>
              <Listener name="listener" onEnd={onEnd} captures={captures} />
              <div data-testid="list" style={{ overflowY: 'auto' }} />
            </GestureZone>
          </GestureProvider>,
        ),
      );
      const list = find('list');
      Object.defineProperties(list, {
        scrollHeight: { value: 1000 },
        clientHeight: { value: 400 },
      });
      list.scrollTop = 100;
      act(() => {
        pointer('pointerdown', list, 1, 10, 100);
        touch('touchstart', list, 10, 100);
      });
      // A first movement barely downward: the list could scroll that way.
      let move: Event | undefined;
      act(() => {
        move = touch('touchmove', list, 11, 102);
      });
      return { onEnd, move };
    };

    it('lets it keep a touch it can scroll', () => {
      const { onEnd, move } = scrolled(() => false);
      expect(move?.defaultPrevented).toBe(false);
      expect(onEnd.mock.lastCall?.[1]).toMatchObject({ interrupted: true });
    });

    it('keeps the touch for a listener that captures where it landed', () => {
      const { onEnd, move } = scrolled((point) => point.x <= 24);
      expect(move?.defaultPrevented).toBe(true);
      expect(onEnd).not.toHaveBeenCalled();
    });
  });

  describe('at the first movement', () => {
    const touch = (
      type: string,
      target: Element,
      x: number,
      y: number,
      fingers = 1,
    ) => {
      const points = Array.from({ length: fingers }, (_, i) => ({
        identifier: i + 1,
        target,
        clientX: x + i * 50,
        clientY: y,
      }));
      const event = new Event(type, { bubbles: true, cancelable: true });
      Object.assign(event, {
        touches: type === 'touchend' ? [] : points,
        changedTouches: points,
      });
      target.dispatchEvent(event);
      return event;
    };

    // A touch landing at 100, 100 on `id` and first moving by dx, dy.
    const first = (id: string, dx: number, dy: number, fingers = 1) => {
      const target = find(id);
      act(() => {
        for (let i = 0; i < fingers; i++) {
          pointer('pointerdown', target, i + 1, 100 + i * 50, 100);
        }
        touch('touchstart', target, 100, 100, fingers);
      });
      let move: Event | undefined;
      act(() => {
        move = touch('touchmove', target, 100 + dx, 100 + dy, fingers);
      });
      return move?.defaultPrevented;
    };

    it('joins a provider inside another to the outer one, so an open inner sidebar lets the outer one take the edge', () => {
      act(() =>
        root.render(
          <GestureProvider>
            <GestureZone>
              <Listener name="outer" captures={(point) => point.x <= 150} />
              <GestureProvider>
                <GestureZone data-testid="inner">
                  <Listener name="inner-sidebar" directions={['left']} />
                </GestureZone>
              </GestureProvider>
            </GestureZone>
          </GestureProvider>,
        ),
      );
      expect(first('inner', 5, 0)).toBe(true);
      expect(find('outer').getAttribute('data-active')).toBe('true');
      expect(find('inner-sidebar').getAttribute('data-active')).toBe('false');
    });

    it('leaves a touch no listener wants to the browser, ending the Gesture', () => {
      const onEnd = vi.fn();
      act(() =>
        root.render(
          <GestureProvider>
            <GestureZone data-testid="card">
              <Listener name="row" directions={['left', 'right']} />
              <Listener name="watch" onEnd={onEnd} />
            </GestureZone>
          </GestureProvider>,
        ),
      );
      expect(first('card', 1, 4)).toBe(false);
      expect(onEnd.mock.lastCall?.[1]).toMatchObject({ interrupted: true });
    });

    it('keeps a touch a listener wants, and tells every listener its Direction', () => {
      const onDirection = vi.fn();
      act(() =>
        root.render(
          <GestureProvider>
            <GestureZone data-testid="card">
              <Listener name="row" directions={['left', 'right']} />
              <Listener name="watch" onDirection={onDirection} />
            </GestureZone>
          </GestureProvider>,
        ),
      );
      expect(first('card', -4, 1)).toBe(true);
      expect(onDirection).toHaveBeenCalledWith('left');
    });

    it('takes every touch for a listener that wants all Directions', () => {
      act(() =>
        root.render(
          <GestureProvider>
            <GestureZone data-testid="card">
              <Listener name="drag" directions="all" />
            </GestureZone>
          </GestureProvider>,
        ),
      );
      expect(first('card', 0, -3)).toBe(true);
    });

    it('always keeps a touch with two fingers down', () => {
      act(() =>
        root.render(
          <GestureProvider>
            <GestureZone data-testid="card">
              <Listener name="watch" />
            </GestureZone>
          </GestureProvider>,
        ),
      );
      expect(first('card', 0, 5, 2)).toBe(true);
    });

    it('gives it to the innermost zone that wants it; acting listeners elsewhere drop it, watchers keep it', () => {
      const sidebar = vi.fn();
      const row = vi.fn();
      const watch = vi.fn();
      act(() =>
        root.render(
          <GestureProvider>
            <GestureZone>
              <Listener name="sidebar" directions={['left']} onEnd={sidebar} />
              <Listener name="watch" onEnd={watch} />
              <GestureZone data-testid="row">
                <Listener name="row" directions={['left']} onEnd={row} />
              </GestureZone>
            </GestureZone>
          </GestureProvider>,
        ),
      );
      expect(first('row', -5, 0)).toBe(true);
      expect(sidebar.mock.lastCall?.[1]).toMatchObject({ interrupted: true });
      expect(row).not.toHaveBeenCalled();
      expect(watch).not.toHaveBeenCalled();
      expect(find('watch').getAttribute('data-active')).toBe('true');
    });

    it('never tells a dropped listener the Direction it wanted', () => {
      const wanted = vi.fn();
      const other = vi.fn();
      act(() =>
        root.render(
          <GestureProvider>
            <GestureZone>
              <Listener
                name="sidebar"
                directions={['right']}
                onDirection={wanted}
              />
              <Listener name="menu" directions={['up']} onDirection={other} />
              <GestureZone data-testid="row">
                <Listener name="row" directions={['right']} />
              </GestureZone>
            </GestureZone>
          </GestureProvider>,
        ),
      );
      expect(first('row', 5, 0)).toBe(true);
      expect(wanted).not.toHaveBeenCalled();
      expect(other).toHaveBeenCalledWith('right');
    });

    it('passes a Direction the inner zone does not want out to the zone around it', () => {
      const row = vi.fn();
      act(() =>
        root.render(
          <GestureProvider>
            <GestureZone>
              <Listener name="sidebar" directions={['left']} />
              <GestureZone data-testid="row">
                <Listener name="row" directions={['right']} onEnd={row} />
              </GestureZone>
            </GestureZone>
          </GestureProvider>,
        ),
      );
      expect(first('row', -5, 0)).toBe(true);
      expect(row.mock.lastCall?.[1]).toMatchObject({ interrupted: true });
      expect(find('sidebar').getAttribute('data-active')).toBe('true');
    });

    it('gives a spot a listener captures to its zone before any Direction inside it', () => {
      const row = vi.fn();
      act(() =>
        root.render(
          <GestureProvider>
            <GestureZone>
              <Listener name="sidebar" captures={(point) => point.x <= 150} />
              <GestureZone data-testid="row">
                <Listener name="row" directions={['right']} onEnd={row} />
              </GestureZone>
            </GestureZone>
          </GestureProvider>,
        ),
      );
      expect(first('row', 5, 0)).toBe(true);
      expect(row.mock.lastCall?.[1]).toMatchObject({ interrupted: true });
      expect(find('sidebar').getAttribute('data-active')).toBe('true');
    });

    it('leaves what a trapped zone does not want to the browser, never to the zones around it', () => {
      const outer = vi.fn();
      act(() =>
        root.render(
          <GestureProvider>
            <GestureZone>
              <Listener name="outer" directions={['down']} onStart={outer} />
              <GestureZone data-testid="card" trapped>
                <Listener name="row" directions={['left']} />
              </GestureZone>
            </GestureZone>
          </GestureProvider>,
        ),
      );
      expect(first('card', 0, 5)).toBe(false);
      expect(outer).not.toHaveBeenCalled();
    });
  });

  describe('at a side edge', () => {
    const touchStart = (target: Element, x: number) => {
      act(() => pointer('pointerdown', target, 1, x, 100));
      const point = { identifier: 1, target, clientX: x, clientY: 100 };
      const event = new Event('touchstart', {
        bubbles: true,
        cancelable: true,
      });
      Object.assign(event, { touches: [point], changedTouches: [point] });
      target.dispatchEvent(event);
      act(() => pointer('pointerup', target, 1, x, 100));
      return event.defaultPrevented;
    };

    const renderEdge = () =>
      act(() =>
        root.render(
          <GestureProvider>
            <GestureZone data-testid="screen">
              <Listener
                name="edges"
                captures={(point) =>
                  point.x <= 24 || point.x >= innerWidth - 24
                }
              />
              <button type="button" data-testid="menu" />
              <div data-testid="slider" data-zone-gesture="disabled" />
            </GestureZone>
            <div data-testid="page" />
          </GestureProvider>,
        ),
      );

    it('keeps a touch that lands there from the browser’s back swipe', () => {
      renderEdge();
      expect(touchStart(find('screen'), 5)).toBe(true);
      expect(touchStart(find('screen'), innerWidth - 5)).toBe(true);
      expect(touchStart(find('screen'), 100)).toBe(false);
    });

    it('leaves it to the browser when no listener could take a touch there', () => {
      act(() =>
        root.render(
          <GestureProvider>
            <GestureZone data-testid="screen">
              <Listener name="watch" />
              <Listener name="down" directions={['down']} />
            </GestureZone>
          </GestureProvider>,
        ),
      );
      expect(touchStart(find('screen'), 5)).toBe(false);
    });

    it('keeps it for a listener that wants the Direction away from the edge', () => {
      act(() =>
        root.render(
          <GestureProvider>
            <GestureZone data-testid="screen">
              <Listener name="right" directions={['right']} />
            </GestureZone>
          </GestureProvider>,
        ),
      );
      expect(touchStart(find('screen'), 5)).toBe(true);
      expect(touchStart(find('screen'), innerWidth - 5)).toBe(false);
    });

    it('leaves it to the browser on what must click, is turned off, or is outside every zone', () => {
      renderEdge();
      expect(touchStart(find('menu'), 5)).toBe(false);
      expect(touchStart(find('slider'), 5)).toBe(false);
      expect(touchStart(find('page'), 5)).toBe(false);
    });
  });

  it('throws outside a zone or provider', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    expect(() => act(() => root.render(<Listener name="lost" />))).toThrow(
      'useGesture must be used inside a GestureZone',
    );
    root = createRoot(host);
    expect(() => act(() => root.render(<GestureZone />))).toThrow(
      'GestureZone must be used inside a GestureProvider',
    );
    root = createRoot(host);
  });
});
