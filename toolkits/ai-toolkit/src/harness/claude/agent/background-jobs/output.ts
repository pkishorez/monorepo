import { open } from 'node:fs/promises';
import { StringDecoder } from 'node:string_decoder';
import { Effect, Stream } from 'effect';

/** How much of what a job wrote before it is read goes first. */
export const TAIL_BYTES = 64 * 1024;

/** How often a job's file is read again for what it wrote since. */
const EVERY_MS = 250;

/**
 * The file a background command writes to, by its task id, as its tool
 * result says: "Command running in background with ID: <id>. Output is
 * being written to: <path>".
 */
const WRITTEN_TO =
  /with ID: (\S+?)\. Output is being written to: (\S+?\.output)\b/;

const isObj = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === 'object' && value !== null;

const textsOf = (content: unknown): ReadonlyArray<string> => {
  if (typeof content === 'string') return [content];
  if (!Array.isArray(content)) return [];
  return content.flatMap((block) =>
    isObj(block) && typeof block['text'] === 'string' ? [block['text']] : [],
  );
};

/** Each task id a user record's tool results name, with the file it writes to. */
export const outputFilesOf = (
  record: Readonly<Record<string, unknown>>,
): ReadonlyArray<readonly [taskId: string, path: string]> => {
  if (record['type'] !== 'user') return [];
  const message = record['message'];
  if (!isObj(message) || !Array.isArray(message['content'])) return [];
  return message['content'].flatMap((block) => {
    if (!isObj(block) || block['type'] !== 'tool_result') return [];
    return textsOf(block['content']).flatMap((text) => {
      const found = WRITTEN_TO.exec(text);
      return found === null ? [] : [[found[1]!, found[2]!] as const];
    });
  });
};

/**
 * Reads a file as it grows: the first read starts at most `TAIL_BYTES`
 * from its end, at a line's start, and each read after gives what was
 * written since. A file not there yet, or one that cannot be read, reads
 * as nothing; one cut shorter is read again from its start.
 */
const makeReader = (path: string) => {
  let at: number | undefined;
  let decoder = new StringDecoder('utf8');
  const read = async () => {
    const file = await open(path, 'r');
    try {
      const { size } = await file.stat();
      if (at !== undefined && size < at) {
        at = 0;
        decoder = new StringDecoder('utf8');
      }
      // First, or fallen far behind: from the tail, one byte early, so a
      // tail that starts a line keeps it once the part line before goes.
      let midFile = false;
      if (at === undefined || size - at > TAIL_BYTES * 4) {
        at = Math.max(0, size - TAIL_BYTES - 1);
        midFile = at > 0;
        decoder = new StringDecoder('utf8');
      }
      if (size === at) return '';
      const buffer = Buffer.alloc(size - at);
      const { bytesRead } = await file.read(buffer, 0, buffer.length, at);
      at += bytesRead;
      let bytes = buffer.subarray(0, bytesRead);
      // Started mid-file: from the first whole line.
      if (midFile) {
        const newline = bytes.indexOf(0x0a);
        bytes = newline === -1 ? bytes : bytes.subarray(newline + 1);
      }
      return decoder.write(bytes);
    } finally {
      await file.close();
    }
  };
  return Effect.promise(() => read().catch(() => ''));
};

/**
 * What a background command writes to its file: the last of it at once,
 * then each piece as it comes, read every quarter second, until `ended`,
 * and once more after, for what it wrote last.
 */
export const followFile = (
  path: string,
  ended: Effect.Effect<void>,
): Stream.Stream<string> =>
  Stream.unwrap(
    Effect.sync(() => {
      const read = makeReader(path);
      const live = Stream.concat(
        Stream.fromEffect(read),
        Stream.fromEffectRepeat(Effect.andThen(Effect.sleep(EVERY_MS), read)),
      );
      return Stream.concat(
        Stream.haltWhen(live, ended),
        Stream.fromEffect(read),
      ).pipe(Stream.filter((text) => text !== ''));
    }),
  );
