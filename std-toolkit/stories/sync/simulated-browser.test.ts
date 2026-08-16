import { describe, expect, it, vi } from 'vitest';
import {
  SimulatedDocument,
  SimulatedLockManager,
} from './simulated-browser.js';

const request = (
  locks: SimulatedLockManager,
  tab: string,
  name: string,
  callback: () => Promise<void>,
  signal = new AbortController().signal,
) => locks.forTab(tab).request(name, { mode: 'exclusive', signal }, callback);

const gate = () => {
  let open!: () => void;
  const promise = new Promise<void>((resolve) => {
    open = resolve;
  });
  return { promise, open };
};

describe('simulated browser lock manager', () => {
  it('keeps matching identities exclusive and hands them off FIFO', async () => {
    const locks = new SimulatedLockManager();
    const release = gate();
    const order: string[] = [];
    const first = request(locks, 'first', 'shared', async () => {
      order.push('first');
      await release.promise;
    });
    const second = request(locks, 'second', 'shared', async () => {
      order.push('second');
    });
    const third = request(locks, 'third', 'shared', async () => {
      order.push('third');
    });

    await vi.waitFor(() => expect(order).toEqual(['first']));
    release.open();
    await Promise.all([first, second, third]);
    expect(order).toEqual(['first', 'second', 'third']);
  });

  it('allows independent identities to run concurrently', async () => {
    const locks = new SimulatedLockManager();
    const release = gate();
    let active = 0;
    let maximum = 0;
    const work = async () => {
      active += 1;
      maximum = Math.max(maximum, active);
      await release.promise;
      active -= 1;
    };

    const left = request(locks, 'left', 'one', work);
    const right = request(locks, 'right', 'two', work);
    await vi.waitFor(() => expect(maximum).toBe(2));
    release.open();
    await Promise.all([left, right]);
  });

  it('removes an aborted waiter without running it', async () => {
    const locks = new SimulatedLockManager();
    const release = gate();
    let waitingRan = false;
    const owner = request(locks, 'owner', 'shared', () => release.promise);
    const controller = new AbortController();
    const waiting = request(
      locks,
      'waiting',
      'shared',
      async () => {
        waitingRan = true;
      },
      controller.signal,
    );
    controller.abort(new Error('tab closed'));

    await expect(waiting).rejects.toThrow('tab closed');
    release.open();
    await owner;
    expect(waitingRan).toBe(false);
  });
});

describe('simulated tab document', () => {
  it('delivers idempotent visibility, freeze, resume, and close events', () => {
    const document = new SimulatedDocument();
    const events: string[] = [];
    for (const event of ['visibilitychange', 'freeze', 'resume', 'pagehide']) {
      document.addEventListener(event, () => events.push(event));
    }

    document.hide();
    document.hide();
    document.show();
    document.freeze();
    document.freeze();
    document.resume();
    document.close();
    document.close();

    expect(events).toEqual([
      'visibilitychange',
      'visibilitychange',
      'freeze',
      'resume',
      'pagehide',
    ]);
  });
});
