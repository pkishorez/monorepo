import { describe, expect, it, vi } from 'vitest';
import type { Direction, MovementEvent, Scroll, TapEvent } from '../engine';
import type { HoldOption, Registration } from './registration';
import { createRegistry } from './registry';

type Zone = ReturnType<typeof createRegistry>;

const zone = (
  parent?: Zone,
  scroll: Scroll = 'none',
  appOwnsEdges = false,
): Zone =>
  createRegistry({
    parent,
    scroll: () => scroll,
    appOwnsEdges: () => appOwnsEdges,
  });

const common = (fingers: 1 | 2 = 1, hold: HoldOption = 'none') => ({
  fingers,
  hold,
  enabled: () => true,
});

const pan = (
  options: { fingers?: 1 | 2; hold?: HoldOption; axis?: 'x' | 'y' } = {},
) => ({
  ...common(options.fingers, options.hold),
  gesture: 'pan' as const,
  axis: options.axis,
  handle: vi.fn<(event: MovementEvent) => void>(),
});

const swipe = (
  direction: Direction,
  options: {
    fingers?: 1 | 2;
    hold?: HoldOption;
    edge?: boolean;
    directions?: () => ReadonlyArray<Direction>;
    opened?: () => boolean;
  } = {},
) => ({
  ...common(options.fingers, options.hold),
  gesture: 'swipe' as const,
  direction,
  edge: options.edge ?? false,
  directions: options.directions ?? (() => [direction]),
  opened: options.opened ?? (() => false),
  handle: vi.fn<(event: MovementEvent) => void>(),
  catch: vi.fn(),
  release: vi.fn(),
});

const tap = (count: 1 | 2, fingers: 1 | 2 = 1, hold: HoldOption = 'none') => ({
  ...common(fingers, hold),
  gesture: 'tap' as const,
  count,
  handle: vi.fn<(event: TapEvent) => void>(),
});

const one = { fingers: 1, hold: undefined } as const;

const movement = (
  kind: MovementEvent['kind'],
  phase: MovementEvent['phase'],
  direction: Direction | undefined,
  edge?: 'left' | 'right',
): MovementEvent => ({
  kind,
  phase,
  fingers: kind === 'pinch' ? 2 : 1,
  hold: undefined,
  direction,
  point: { x: 0, y: 0 },
  offset: { x: 0, y: 0 },
  velocity: { x: 0, y: 0 },
  scale: 1,
  origin: { x: 0, y: 0 },
  edge,
});

const add = (registry: Zone, ...registrations: ReadonlyArray<Registration>) => {
  for (const registration of registrations) registry.add(registration);
};

describe('the zone chain', () => {
  it('gives a movement to the innermost zone that takes it', () => {
    const root = zone();
    const row = zone(root);
    const open = swipe('left');
    const sidebar = swipe('right');
    add(root, sidebar);
    add(row, open);
    expect(row.policy.movement(one, 'left', undefined)).toBe('swipe');
    expect(row.policy.movement(one, 'right', undefined)).toBe('swipe');
    expect(row.policy.movement(one, 'up', undefined)).toBeUndefined();

    row.dispatch(movement('swipe', 'start', 'right'));
    row.dispatch(movement('swipe', 'move', 'right'));
    expect(sidebar.handle).toHaveBeenCalledTimes(2);
    expect(open.handle).not.toHaveBeenCalled();
  });

  it('lets an inner Pan win over an outer Swipe of the same combination', () => {
    const root = zone();
    const map = zone(root);
    const sidebar = swipe('right');
    const drag = pan();
    add(root, sidebar);
    add(map, drag);
    expect(map.policy.movement(one, 'right', undefined)).toBe('pan');
    map.dispatch(movement('pan', 'start', 'right'));
    expect(drag.handle).toHaveBeenCalled();
    expect(sidebar.handle).not.toHaveBeenCalled();
  });

  it('lets a Swipe claim its own directions and a Pan the rest, in one zone', () => {
    const photos = zone();
    const dismiss = swipe('down');
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const page = pan({ axis: 'x' });
    add(photos, dismiss, page);
    warn.mockRestore();
    expect(photos.policy.movement(one, 'down', undefined)).toBe('swipe');
    expect(photos.policy.movement(one, 'left', undefined)).toBe('pan');
    expect(photos.policy.movement(one, 'right', undefined)).toBe('pan');
    expect(photos.policy.movement(one, 'up', undefined)).toBe('pan');
    photos.dispatch(movement('swipe', 'start', 'down'));
    expect(dismiss.handle).toHaveBeenCalled();
    expect(page.handle).not.toHaveBeenCalled();
    photos.dispatch(movement('swipe', 'end', 'down'));
    photos.dispatch(movement('pan', 'start', 'left'));
    expect(page.handle).toHaveBeenCalledTimes(1);
  });

  it('gives a stay Swipe resting at 1 the way back, before a Pan', () => {
    const root = zone();
    let open = false;
    const drawer = swipe('right', {
      directions: () => (open ? ['left'] : ['right']),
    });
    const drag = pan({ axis: 'x' });
    add(root, drawer, drag);
    expect(root.policy.movement(one, 'left', undefined)).toBe('pan');
    open = true;
    expect(root.policy.movement(one, 'left', undefined)).toBe('swipe');
    expect(root.policy.movement(one, 'right', undefined)).toBe('pan');
  });

  it("lets an inner zone's Pan or Swipe win over an outer edge fallback", () => {
    const root = zone();
    const sidebar = swipe('right', { edge: true });
    add(root, sidebar);
    const matrix = zone(root);
    add(matrix, swipe('right'));
    const map = zone(root);
    add(map, pan());
    const feed = zone(root, 'y');
    add(feed, swipe('down'));
    expect(root.edgeState(sidebar)).toBe('zone');
    matrix.dispatch(movement('swipe', 'start', 'right'));
    map.dispatch(movement('pan', 'start', 'right'));
    expect(sidebar.handle).not.toHaveBeenCalled();
    // Nobody inside the feed wants a sideways movement: the fallback takes it.
    expect(feed.policy.movement(one, 'right', undefined)).toBe('swipe');
    feed.dispatch(movement('swipe', 'start', 'right'));
    expect(sidebar.handle).toHaveBeenCalled();
  });

  it("closes an open outer drawer before an inner zone's Swipe that way", () => {
    const root = zone();
    let open = false;
    const sidebar = swipe('right', {
      edge: true,
      directions: () => (open ? ['left'] : ['right']),
      opened: () => open,
    });
    add(root, sidebar);
    const demo = zone(root);
    const panel = swipe('left', { edge: true });
    add(demo, panel);
    demo.dispatch(movement('swipe', 'start', 'left'));
    expect(panel.handle).toHaveBeenCalledTimes(1);
    demo.dispatch(movement('swipe', 'end', 'left'));
    open = true;
    demo.dispatch(movement('swipe', 'start', 'left'));
    expect(sidebar.handle).toHaveBeenCalledTimes(1);
    expect(panel.handle).toHaveBeenCalledTimes(2);
  });

  it('listens in the far strip while an edge drawer is open, to close it from there', () => {
    const root = zone(undefined, 'none', true);
    let open = false;
    add(root, swipe('right', { edge: true, opened: () => open }));
    expect(root.wantsStrip('right')).toBe(false);
    open = true;
    expect(root.wantsStrip('right')).toBe(true);
  });

  it('keeps a movement with the hooks it started with until it ends', () => {
    const root = zone();
    const first = swipe('down');
    add(root, first);
    root.dispatch(movement('swipe', 'start', 'down'));
    const second = swipe('down');
    add(root, second);
    root.dispatch(movement('swipe', 'move', 'down'));
    root.dispatch(movement('swipe', 'end', 'down'));
    root.dispatch(movement('swipe', 'move', 'down'));
    expect(first.handle).toHaveBeenCalledTimes(3);
    expect(second.handle).not.toHaveBeenCalled();
  });

  it('fires every hook on the same key', () => {
    const root = zone();
    const a = tap(1);
    const b = tap(1);
    add(root, a, b);
    root.dispatch({
      kind: 'tap',
      count: 1,
      fingers: 1,
      hold: undefined,
      point: { x: 0, y: 0 },
    });
    expect(a.handle).toHaveBeenCalledOnce();
    expect(b.handle).toHaveBeenCalledOnce();
  });

  it('matches a Hold of either side for hold: any', () => {
    const root = zone();
    add(root, pan({ hold: 'any' }));
    expect(
      root.policy.movement({ fingers: 1, hold: 'left' }, 'up', undefined),
    ).toBe('pan');
    expect(
      root.policy.movement({ fingers: 1, hold: 'right' }, 'up', undefined),
    ).toBe('pan');
    expect(root.policy.movement(one, 'up', undefined)).toBeUndefined();
  });

  it('asks a tap to wait only when a double tap is registered for its combination', () => {
    const root = zone();
    const inner = zone(root);
    add(root, tap(2, 2));
    add(inner, tap(1));
    expect(inner.policy.doubleTap(one)).toBe(false);
    expect(inner.policy.doubleTap({ fingers: 2, hold: undefined })).toBe(true);
  });

  it('skips disabled hooks', () => {
    const root = zone();
    let on = true;
    add(root, { ...pan(), enabled: () => on });
    expect(root.policy.movement(one, 'up', undefined)).toBe('pan');
    on = false;
    expect(root.policy.movement(one, 'up', undefined)).toBeUndefined();
  });

  it('follows a stay Swipe to the directions it takes now', () => {
    const root = zone();
    let open = false;
    add(
      root,
      swipe('left', { directions: () => (open ? ['right'] : ['left']) }),
    );
    expect(root.policy.movement(one, 'right', undefined)).toBeUndefined();
    open = true;
    expect(root.policy.movement(one, 'right', undefined)).toBe('swipe');
    expect(root.policy.movement(one, 'left', undefined)).toBeUndefined();
  });
});

describe('catching', () => {
  it('catches every hook in the chain as a touch lands, and releases those it gave nothing', () => {
    const root = zone();
    const inner = zone(root);
    const sidebar = swipe('right');
    const refresh = swipe('down');
    add(root, sidebar);
    add(inner, refresh);
    inner.dispatch({ kind: 'touch', phase: 'start' });
    inner.dispatch(movement('swipe', 'start', 'down'));
    inner.dispatch(movement('swipe', 'end', 'down'));
    inner.dispatch({ kind: 'touch', phase: 'end' });
    expect(sidebar.catch).toHaveBeenCalledOnce();
    expect(refresh.catch).toHaveBeenCalledOnce();
    expect(sidebar.release).toHaveBeenCalledOnce();
    expect(refresh.release).not.toHaveBeenCalled();
  });
});

describe('edges', () => {
  it('opens an edge Swipe only from its strip where the app owns the edges', () => {
    const root = zone(undefined, 'none', true);
    add(root, swipe('right', { edge: true }));
    expect(root.wantsStrip('left')).toBe(true);
    expect(root.wantsStrip('right')).toBe(false);
    expect(root.policy.movement(one, 'right', 'left')).toBe('swipe');
    expect(root.policy.movement(one, 'right', undefined)).toBeUndefined();
  });

  it('lets only edge Swipes start from a strip', () => {
    const root = zone(undefined, 'none', true);
    const inner = zone(root);
    add(root, swipe('right', { edge: true }));
    add(inner, pan());
    expect(inner.policy.movement(one, 'right', 'left')).toBe('swipe');
    expect(inner.policy.movement(one, 'right', undefined)).toBe('pan');
  });

  it('falls back to a Swipe from anywhere where the edges are not the app’s', () => {
    const root = zone();
    const sidebar = swipe('right', { edge: true });
    add(root, sidebar);
    expect(root.wantsStrip('left')).toBe(false);
    expect(root.policy.movement(one, 'right', undefined)).toBe('swipe');
    expect(root.edgeState(sidebar)).toBe('zone');
  });

  it('turns the fallback off when another hook in the chain already takes it', () => {
    const root = zone();
    const inner = zone(root);
    const panel = swipe('left', { edge: true });
    add(root, swipe('left'));
    add(inner, panel);
    expect(inner.edgeState(panel)).toBe('off');
    expect(inner.policy.movement(one, 'left', undefined)).toBe('swipe');
    inner.dispatch(movement('swipe', 'start', 'left'));
    expect(panel.handle).not.toHaveBeenCalled();
  });

  it('reports an edge Swipe as from the edge where the app owns it', () => {
    const root = zone(undefined, 'none', true);
    const sidebar = swipe('right', { edge: true });
    add(root, sidebar);
    expect(root.edgeState(sidebar)).toBe('edge');
  });
});

describe('development checks', () => {
  it('warns, without throwing, when a free Pan shares a combination with a Swipe', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const root = zone();
    add(root, swipe('up'));
    expect(() => root.add(pan())).not.toThrow();
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0]?.[0]).toMatch(/one finger with no Hold/);
    warn.mockClear();
    add(root, pan({ fingers: 2, axis: 'x' }), swipe('down', { fingers: 2 }));
    add(root, pan({ hold: 'left' }));
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it('allows them in nested zones', () => {
    const root = zone();
    add(root, swipe('right'));
    expect(() => zone(root).add(pan())).not.toThrow();
  });

  it("refuses a one-finger Pan along the zone's scroll axis, but not a Swipe", () => {
    const feed = zone(undefined, 'y');
    expect(() => feed.add(pan())).toThrow(/scroll axis \(y\)/);
    expect(() => feed.add(pan({ axis: 'y' }))).toThrow();
    expect(() => feed.add(pan({ axis: 'x' }))).not.toThrow();
    expect(() => feed.add(pan({ fingers: 2 }))).not.toThrow();
    expect(() => zone(undefined, 'y').add(swipe('down'))).not.toThrow();
  });

  it('refuses an edge Swipe that is not one finger sideways', () => {
    expect(() => zone().add(swipe('up', { edge: true }))).toThrow(/side edges/);
    expect(() =>
      zone().add(swipe('left', { edge: true, fingers: 2 })),
    ).toThrow();
  });
});
