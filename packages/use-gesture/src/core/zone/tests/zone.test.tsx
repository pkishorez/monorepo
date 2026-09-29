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
} from '..';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

// jsdom has no PointerEvent: a MouseEvent with a pointer id stands in.
const pointer = (
  type: string,
  target: Element,
  id: number,
  x: number,
  y: number,
) => {
  const event = new MouseEvent(type, {
    bubbles: true,
    cancelable: true,
    composed: true,
    clientX: x,
    clientY: y,
    button: 0,
  });
  Object.assign(event, { pointerId: id, pointerType: 'touch' });
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
