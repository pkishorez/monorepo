import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { Effect } from 'effect';
import { nextUlid } from '@kestack/std-toolkit/core';
import type { Attachment } from '@kestack/ai-toolkit/contract';
import { isImage, safeName, sizeOf } from './files.js';

/*
 * A user message's Attachments, as a Session keeps them. An image goes to
 * the harness as it came; any other file is saved under the attachments
 * folder, `<sessionId>/<ulid>-<name>`, and kept by its path, so a harness
 * only ever sees images.
 */

/** An Attachment as Raw records it: an image's data, or a saved file's path. */
export interface KeptAttachment {
  readonly name: string;
  readonly mime: string;
  readonly size: number;
  readonly data?: string;
  readonly path?: string;
}

const keep = (
  root: string,
  sessionId: string,
  attachment: Attachment,
): Effect.Effect<KeptAttachment> =>
  Effect.gen(function* () {
    const size = sizeOf(attachment.data);
    const { name, mime } = attachment;
    if (isImage(mime, size)) return { name, mime, size, data: attachment.data };
    const folder = join(root, sessionId);
    const path = join(folder, `${yield* nextUlid}-${safeName(name)}`);
    yield* Effect.promise(async () => {
      await mkdir(folder, { recursive: true });
      await writeFile(path, Buffer.from(attachment.data, 'base64'));
    });
    return { name, mime, size, path };
  });

/** Saves a message's files that are not images under `root`, one folder per Session. */
export const saveAttachments = (
  root: string,
  sessionId: string,
  attachments: ReadonlyArray<Attachment>,
): Effect.Effect<ReadonlyArray<KeptAttachment>> =>
  Effect.forEach(attachments, (each) => keep(root, sessionId, each));
