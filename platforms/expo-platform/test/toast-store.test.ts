import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ToastStore } from '../src/components/parts/toast-store';

describe('toast store', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('counts down only once the toast is drawn', () => {
    const store = new ToastStore();
    const id = store.show({ label: 'Deleted', duration: 4000 });
    // A busy JS thread: longer than the duration before it is drawn.
    vi.advanceTimersByTime(6000);
    expect(store.getSnapshot()).toHaveLength(1);
    store.shown(id);
    vi.advanceTimersByTime(3999);
    expect(store.getSnapshot()).toHaveLength(1);
    vi.advanceTimersByTime(1);
    expect(store.getSnapshot()).toHaveLength(0);
  });

  it('starts the countdown once, however often it is drawn', () => {
    const store = new ToastStore();
    const id = store.show({ label: 'Saved', duration: 1000 });
    store.shown(id);
    vi.advanceTimersByTime(600);
    store.shown(id);
    vi.advanceTimersByTime(400);
    expect(store.getSnapshot()).toHaveLength(0);
  });

  it('keeps a paused countdown parked until it resumes', () => {
    const store = new ToastStore();
    const id = store.show({ label: 'Saved', duration: 1000 });
    store.pauseTimers();
    store.shown(id);
    vi.advanceTimersByTime(5000);
    expect(store.getSnapshot()).toHaveLength(1);
    store.resumeTimers();
    vi.advanceTimersByTime(1000);
    expect(store.getSnapshot()).toHaveLength(0);
  });
});
