import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { Effect, Schema } from 'effect';
import { nextUlid } from '@kestack/std-toolkit/core';
import type {
  Attachment,
  TurnInput,
} from '../../../services/harness/contract/index.js';
import { EngineRaw } from '../engine-raw/index.js';
import { isImage, safeName, sizeOf } from './files.js';

/*
 * A user message as a Session keeps it: its text, its Attachments as Raw
 * records them, and any change of model or settings it carries. An image
 * goes to the harness as it came; any other file is saved under the
 * attachments folder, `<sessionId>/<ulid>-<name>`, and named in the text
 * the harness reads, so a harness only ever sees images.
 */

export const Prompt = Schema.Struct({
  /** The Turn it starts, or its own id when it steers one. */
  id: Schema.String,
  text: Schema.String,
  attachments: Schema.Array(EngineRaw.Attachment),
  model: Schema.optionalKey(Schema.String),
  settings: Schema.optionalKey(Schema.Record(Schema.String, Schema.String)),
});
export type Prompt = typeof Prompt.Type;

/** What a user message carries, as the engine is handed it. */
export interface SaveAttachments {
  /** The folder files are saved under, one folder per Session. */
  readonly root: string;
  readonly sessionId: string;
  readonly id: string;
  readonly text: string;
  readonly attachments: ReadonlyArray<Attachment>;
  readonly model?: string | undefined;
  readonly settings?: Readonly<Record<string, string>> | undefined;
}

const keep = (root: string, sessionId: string, attachment: Attachment) =>
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

/** A user message as a Session keeps it, its files saved on disk. */
export const promptOf = (message: SaveAttachments): Effect.Effect<Prompt> =>
  Effect.map(
    Effect.forEach(message.attachments, (each) =>
      keep(message.root, message.sessionId, each),
    ),
    (attachments) => ({
      id: message.id,
      text: message.text,
      attachments,
      ...(message.model === undefined ? {} : { model: message.model }),
      ...(message.settings === undefined
        ? {}
        : { settings: { ...message.settings } }),
    }),
  );

/** What the harness reads of a Prompt: images inline, saved files named in the text. */
export const toTurnInput = (prompt: Prompt): TurnInput => {
  const lines = prompt.attachments.flatMap((each) =>
    each.path === undefined
      ? []
      : [`Attached file: ${each.path} (${each.mime})`],
  );
  return {
    text: [prompt.text, ...lines].filter((line) => line !== '').join('\n'),
    images: prompt.attachments.flatMap(({ name, mime, data }) =>
      data === undefined ? [] : [{ name, mime, data }],
    ),
    ...(prompt.model === undefined ? {} : { model: prompt.model }),
    ...(prompt.settings === undefined ? {} : { settings: prompt.settings }),
  };
};
