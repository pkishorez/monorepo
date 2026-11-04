// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root as ReactRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HANDOVER_WAIT, useHandover } from '../view.tsx';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

/*
 * A Session its Draft started takes the Draft's place once it can be drawn
 * whole, its row synced; a row that never syncs is waited for no more than
 * `HANDOVER_WAIT`, so the page never stays on its Starting.
 */

let root: ReactRoot | undefined;
let drawn = 0;

function Handing({ ready }: { readonly ready: boolean }) {
  useHandover(ready, () => drawn++);
  return null;
}

const draw = async (ready: boolean) => {
  root ??= createRoot(document.body.appendChild(document.createElement('div')));
  await act(async () => root!.render(<Handing ready={ready} />));
};

beforeEach(() => {
  vi.useFakeTimers();
  drawn = 0;
});

afterEach(async () => {
  await act(async () => root?.unmount());
  root = undefined;
  document.body.innerHTML = '';
  vi.useRealTimers();
});

describe('a Session handed over', () => {
  it('takes over once it can be drawn whole', async () => {
    await draw(false);
    expect(drawn).toBe(0);
    await draw(true);
    expect(drawn).toBe(1);
  });

  it('takes over all the same once its row has not synced in time', async () => {
    await draw(false);
    await act(async () => vi.advanceTimersByTime(HANDOVER_WAIT - 1));
    expect(drawn).toBe(0);
    await act(async () => vi.advanceTimersByTime(1));
    expect(drawn).toBe(1);
    // Ready after, it is not said twice.
    await draw(true);
    expect(drawn).toBe(1);
  });
});
