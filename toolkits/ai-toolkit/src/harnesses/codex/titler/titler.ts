import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Duration, Effect, Layer, Stream } from 'effect';
import {
  HarnessBinaries,
  HarnessError,
  Titler,
} from '../../../harness/index.js';
import { start, type AppServer, type ThreadItem } from '../app-server/index.js';
import { listModels } from '../catalog/index.js';
import {
  openSession,
  restore,
  TEXT_CHUNK,
  type TextChunk,
} from '../thread/index.js';

/** The titling model the spec names; used whenever this account lists it. */
const TITLE_MODEL = 'gpt-6-luna';
const TITLE_TIMEOUT = Duration.seconds(30);
const MAX_WORDS = 6;

/** Each message's share of the prompt, so a long paste cannot crowd the rest out. */
const MESSAGE_CHARS = 2_000;

/** Asks for a title that names what the session is about now: the latest message leads. */
const prompt = (userMessages: ReadonlyArray<string>) => {
  const messages = userMessages.map((message) =>
    message.length > MESSAGE_CHARS
      ? `${message.slice(0, MESSAGE_CHARS)}…`
      : message,
  );
  const latest = messages.at(-1) ?? '';
  const earlier = messages.slice(0, -1);
  return [
    `Write a title of at most ${MAX_WORDS} words for a coding session, from what its user asked.`,
    earlier.length === 0
      ? 'Name the task the message asks for.'
      : 'Name what the session is about now: the latest message counts most; the earlier ones are context, and a topic they share with it counts too.',
    'Reply with the title only: no quotes, no punctuation at the end, no tools.',
    ...(earlier.length === 0
      ? []
      : [
          '',
          '<earlier-messages>',
          ...earlier.map((message) => `<message>\n${message}\n</message>`),
          '</earlier-messages>',
        ]),
    '',
    '<latest-message>',
    latest,
    '</latest-message>',
  ].join('\n');
};

/**
 * gpt-6-luna when the account lists it; otherwise the account's own luna
 * (small, fast) model, else its default. ChatGPT accounts reject unlisted
 * models outright.
 */
const titleModel = (server: AppServer) =>
  listModels(server).pipe(
    Effect.map(
      (models) =>
        (
          models.find((model) => model.id === TITLE_MODEL) ??
          models.find((model) => model.id.includes('luna')) ??
          models.find((model) => model.isDefault === true) ??
          models[0]
        )?.id ?? TITLE_MODEL,
    ),
  );

/**
 * The first line of a reply, without quotes, markdown, or characters that
 * print as nothing (control, private-use and unassigned ones a model may
 * emit), cut to six words.
 */
export const clean = (reply: string): string =>
  (reply.trim().split('\n')[0] ?? '')
    .replace(/\p{C}/gu, '')
    .replace(/^[#*\s"'`“”]+|[*\s"'`“”.:!]+$/g, '')
    .split(/\s+/)
    .filter((word) => word !== '')
    .slice(0, MAX_WORDS)
    .join(' ');

const tempFolder = Effect.acquireRelease(
  Effect.tryPromise({
    try: () => mkdtemp(join(tmpdir(), 'ai-toolkit-title-')),
    catch: (cause) =>
      new HarnessError({ message: 'No temp folder for the titler', cause }),
  }),
  (folder) =>
    Effect.promise(() => rm(folder, { recursive: true, force: true })),
);

const title = (userMessages: ReadonlyArray<string>) =>
  Effect.gen(function* () {
    // The configured Harness Binary when the caller provides one, else the default.
    const binaries = yield* Effect.serviceOption(HarnessBinaries).pipe(
      Effect.map((found) =>
        found._tag === 'Some'
          ? found.value
          : { path: () => Effect.succeed(undefined) },
      ),
    );
    const cwd = yield* tempFolder;
    const server = yield* start(cwd).pipe(
      Effect.provideService(HarnessBinaries, binaries),
    );
    const session = yield* openSession(server, {
      cwd,
      model: yield* titleModel(server),
      sandbox: 'read-only',
      effort: 'low',
      ephemeral: true,
    });
    const chunks: Record<string, Array<string>> = {};
    const reply = yield* session
      .turn({ text: prompt(userMessages), images: [] })
      .pipe(
        Stream.runFold(
          () => '',
          (last, out) => {
            if (out.agentId !== undefined) return last;
            if (out.kind === TEXT_CHUNK) {
              const chunk = out.payload as unknown as TextChunk;
              (chunks[chunk.streamId] ??= []).push(chunk.text);
              return last;
            }
            if (out.kind !== 'item/completed') return last;
            const { item } = restore(out.payload, chunks) as unknown as {
              item: ThreadItem;
            };
            return item.type === 'agentMessage' ? item.text : last;
          },
        ),
      );
    const cleaned = clean(reply);
    if (cleaned === '')
      return yield* new HarnessError({ message: 'Codex wrote no title' });
    return cleaned;
  }).pipe(
    Effect.scoped,
    Effect.timeoutOrElse({
      duration: TITLE_TIMEOUT,
      orElse: () =>
        Effect.fail(
          new HarnessError({ message: 'Codex took too long to write a title' }),
        ),
    }),
  );

/** Titles a session with a one-shot, read-only Codex in a temp folder. */
export const codexTitler = Layer.succeed(Titler, { title });
