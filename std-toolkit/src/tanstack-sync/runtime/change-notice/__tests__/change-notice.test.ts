import { describe, expect, it, vi } from 'vitest';
import {
  makeChangeNotice,
  type ChangeNoticeChannel,
} from '../change-notice.js';

describe('change notice', () => {
  it('waits for admitted notice work before closing', async () => {
    let channel: ChangeNoticeChannel | null = null;
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let started = false;
    let completed = false;
    const notice = makeChangeNotice({
      scope: 'test',
      collection: 'Todo',
      channel: () => {
        channel = {
          onmessage: null,
          postMessage: () => undefined,
          close: () => undefined,
        };
        return channel;
      },
      onNotice: async () => {
        started = true;
        await gate;
        completed = true;
      },
    });

    (channel as ChangeNoticeChannel | null)?.onmessage?.({ data: 'Todo' });
    await vi.waitFor(() => expect(started).toBe(true));

    let closed = false;
    const closing = notice.close().then(() => {
      closed = true;
    });
    await Promise.resolve();
    expect(closed).toBe(false);

    release();
    await closing;
    expect(completed).toBe(true);
  });
});
