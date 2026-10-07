// @vitest-environment jsdom
import { MotionGlobalConfig } from 'motion/react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GestureProvider, GestureZone } from '../../../zones/index.ts';
import {
  type PullToRefresh,
  type PullToRefreshOptions,
  usePullToRefresh,
} from '../index.ts';
import { resist } from '../use-pull-to-refresh.ts';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

// jsdom has no PointerEvent: a MouseEvent with a pointer id stands in.
const pointer = (type: string, y: number) => {
  const event = new MouseEvent(type, {
    bubbles: true,
    cancelable: true,
    clientX: 100,
    clientY: y,
    button: 0,
  });
  Object.assign(event, { pointerId: 1, pointerType: 'touch' });
  const zone = host.querySelector('[data-testid="zone"]');
  zone?.dispatchEvent(event);
};

let host: HTMLDivElement;
let root: Root;
let pull: PullToRefresh;

function Probe(props: PullToRefreshOptions) {
  pull = usePullToRefresh(props);
  return null;
}

const render = (onRefresh: PullToRefreshOptions['onRefresh']) =>
  act(() =>
    root.render(
      <GestureProvider>
        <GestureZone data-testid="zone">
          <Probe onRefresh={onRefresh} distance={72} />
        </GestureZone>
      </GestureProvider>,
    ),
  );

const drag = (to: number) => {
  act(() => pointer('pointerdown', 0));
  for (let step = 1; step <= 5; step += 1) {
    act(() => vi.advanceTimersByTime(16));
    act(() => pointer('pointermove', (to * step) / 5));
  }
};

beforeEach(() => {
  MotionGlobalConfig.instantAnimations = true;
  vi.useFakeTimers({
    toFake: ['setInterval', 'clearInterval', 'setTimeout', 'performance'],
  });
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.useRealTimers();
  MotionGlobalConfig.instantAnimations = false;
});

describe('usePullToRefresh', () => {
  it('pulls with resistance, arms past its distance and refreshes', async () => {
    let done = () => {};
    const onRefresh = vi.fn(
      () => new Promise<void>((resolve) => (done = resolve)),
    );
    render(onRefresh);
    drag(100);
    expect(pull.state).toBe('pulling');
    expect(pull.y.get()).toBeCloseTo(resist(100, 144));
    drag(200);
    expect(pull.state).toBe('armed');
    expect(pull.progress.get()).toBe(1);
    act(() => pointer('pointerup', 200));
    expect(pull.state).toBe('refreshing');
    await act(async () => {});
    expect(onRefresh).toHaveBeenCalledTimes(1);

    // A pull while refreshing does nothing.
    drag(200);
    act(() => pointer('pointerup', 200));
    expect(onRefresh).toHaveBeenCalledTimes(1);

    await act(async () => done());
    expect(pull.state).toBe('idle');
  });

  it('springs back without refreshing when released short', async () => {
    const onRefresh = vi.fn();
    render(onRefresh);
    drag(100);
    act(() => pointer('pointerup', 100));
    await act(async () => {});
    expect(pull.state).toBe('idle');
    expect(onRefresh).not.toHaveBeenCalled();
  });

  it('reaches its distance at twice the pull', () => {
    expect(resist(144, 144)).toBe(72);
  });
});
