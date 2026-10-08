import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import type { CDPSession } from 'playwright-core';

import type { Frame } from '../../../story/schema/index.js';
import type { ProofClock } from '../proof-clock.js';

export interface Recorder {
  readonly stop: () => Promise<readonly Frame[]>;
}

/** Writes every screencast frame of one Tab to `<folder>/<slug>/<n>.jpg`, timed on the Proof clock. */
export async function startRecording(
  cdp: CDPSession,
  options: {
    readonly folder: string;
    readonly slug: string;
    readonly clock: ProofClock;
    readonly size: { readonly width: number; readonly height: number };
  },
): Promise<Recorder> {
  const { folder, slug, clock, size } = options;
  await mkdir(join(folder, slug), { recursive: true });
  const frames: Frame[] = [];
  const writes: Promise<void>[] = [];
  cdp.on('Page.screencastFrame', ({ data, metadata, sessionId }) => {
    cdp.send('Page.screencastFrameAck', { sessionId }).catch(() => {});
    const file = `${slug}/${frames.length + 1}.jpg`;
    frames.push({
      at:
        metadata.timestamp === undefined
          ? clock.now()
          : metadata.timestamp * 1000 - clock.startedAt,
      file,
    });
    writes.push(writeFile(join(folder, file), Buffer.from(data, 'base64')));
  });
  await cdp.send('Page.startScreencast', {
    format: 'jpeg',
    quality: 80,
    maxWidth: size.width,
    maxHeight: size.height,
    everyNthFrame: 1,
  });
  return {
    stop: async () => {
      await cdp.send('Page.stopScreencast').catch(() => {});
      await Promise.all(writes);
      return [...frames].sort((left, right) => left.at - right.at);
    },
  };
}
